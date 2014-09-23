var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');
var http = require('request');
var RSVP = require('rsvp');
var jwt = require('jwt-simple');
var urls = require('url');
var util = require('util');

function HipChat(addon, app){
    var self = this;

    // override the following...
    addon.middleware = self.middleware;
    addon.loadClientInfo = self.loadClientInfo;
    addon.authenticate = self.authenticate;
    addon._configure = self._configure;
    addon.getAccessToken = self.getAccessToken;
    // temporarily support both capabilities and modules
    if (addon.descriptor.modules) {
        addon.descriptor.capabilities = addon.descriptor.modules;
    }

    // Disable auto-registration... not necessary with HipChat
    addon.register = function(){
        self.logger.info('Auto registration not available with HipChat add-ons')
    };

    addon._verifyKeys = function(){};

    // mixin the addon
    _.extend(self, addon);
}

var proto = HipChat.prototype = Object.create(EventEmitter.prototype);

proto.getAccessToken = function(clientInfo, scopes) {
    var self = this;
    function generateAccessToken(scopes){
        return new RSVP.Promise(function(resolve, reject){
            var tokenUrl = clientInfo.capabilitiesDoc.capabilities.oauth2Provider.tokenUrl;
            http.post(tokenUrl, {
                form: {
                    'grant_type': 'client_credentials',
                    'scope': scopes.join(' ')
                },
                auth: {
                    user: clientInfo.clientKey,
                    pass: clientInfo.oauthSecret
                }
            }, function(err, res, body){
                if(!err) {
                    try {
                        var token = JSON.parse(body);
                        token.created = new Date().getTime() / 1000;
                        resolve(token);
                    } catch(e) {
                        reject(e);
                    }
                } else {
                    reject(err);
                }
            });
        });
    }

    return new RSVP.Promise(function(resolve, reject){
        scopes = scopes || self.descriptor.capabilities.hipchatApiConsumer.scopes;
        var scopeKey = scopes.join("|");

        function generate() {
            generateAccessToken(scopes).then(
                function(token) {
                    self.settings.set(scopeKey, token, clientInfo.clientKey);
                    resolve(token);
                },
                function(err) {
                    reject(err);
                }
            );
        }

        self.settings.get(scopeKey, clientInfo.clientKey).then(function(token){
            if (token) {
                if (token.expires_in + token.created < (new Date().getTime() / 1000)) {
                    generate();
                } else {
                    resolve(token);
                }
            } else {
                generate();
            }
        }, function(err) {
            reject(err);
        });
    });
};

proto._configure = function(){
    var self = this;
    var baseUrl = urls.parse(self.config.localBaseUrl());
    var basePath = baseUrl.path && baseUrl.path.length > 1 ? baseUrl.path : '';

    self.app.get(basePath + '/atlassian-connect.json', function (req, res) {
        res.json(self.descriptor);
    });

    // HC Connect install verification flow
    function verifyInstallation(url){
        return new RSVP.Promise(function(resolve, reject){
            http.get(url, function(err, res, body){
                var data = JSON.parse(body);
                if(!err){
                    if(data.links.self === url){
                        resolve(data);
                    } else {
                        reject("The capabilities URL " + url + " doesn't match the resource's self link " + data.links.self);
                    }
                } else {
                    reject(err);
                }
            });
        });
    };

    // register routes for installable handler
    if (typeof self.descriptor.capabilities.installable != 'undefined') {
        var callbackUrl = '/'+self.descriptor.capabilities.installable.callbackUrl.split('/').slice(3).join('/');

        // Install handler
        self.app.post(

            // mount path
            callbackUrl,

            // TODO auth middleware

            // request handler
            function (req, res) {
                try {
                    verifyInstallation(req.body.capabilitiesUrl)
                        .then(function(hcCapabilities){
                            var clientInfo = {
                                clientKey: req.body.oauthId,
                                oauthSecret: req.body.oauthSecret,
                                capabilitiesUrl: req.body.capabilitiesUrl,
                                capabilitiesDoc: hcCapabilities,
                                roomId: req.body.roomId
                            };
                            var clientKey = clientInfo.clientKey;
                            self.getAccessToken(clientInfo)
                                .then(function(tokenObj){
                                    clientInfo.groupId = tokenObj.group_id;
                                    clientInfo.groupName = tokenObj.group_name;
                                    self.emit('installed', clientKey, clientInfo, req);
                                    self.emit('plugin_enabled', clientKey, clientInfo, req);
                                    self.settings.set('clientInfo', clientInfo, clientKey).then(function (data) {
                                        self.logger.info("Saved tenant details for " + clientKey + " to database\n" + util.inspect(data));
                                        self.emit('host_settings_saved', clientKey, data);
                                        res.send(204);
                                    }, function (err) {
                                        res.send(500, 'Could not lookup stored client data for ' + clientKey + ': ' + err);
                                    });
                                })
                                .then(null, function(err){
                                    res.send(500, err);
                                });
                        })
                        .then(null, function(err){
                            res.send(500, err);
                        }
                    );
                } catch (e) {
                    res.send(500, e);
                }
            }
        );
    }

    // uninstall handler
    self.app.delete(
        callbackUrl + '/:oauthId',
        // verify request,
        function(req, res){
            try {
                self.emit('uninstalled', req.params.oauthId);
                res.send(204);
            } catch (e) {
                res.send(500, e);
            }
        }
    );
}

proto.middleware = function(){

    var addon = this;
    return function(req, res, next){
        var hostUrl = req.param('xdmhost');
        var params;

        if (hostUrl) {
            params = {
                hostBaseUrl: hostUrl
            };
            _.extend(req.session, params);
        } else {
            params = req.session;
        }

        augmentRequest(params, req, res, next);

    }

    function augmentRequest(params, req, res, next) {
        if (params && params.hostBaseUrl) {
            res.locals = _.extend({}, res.locals || {}, params, {
                title: addon.config.name,
                appKey: addon.config.key,
                localBaseUrl: addon.config.localBaseUrl(),
                hostStylesheetUrl: hostResourceUrl(addon.app, params.hostBaseUrl, 'css'),
                hostScriptUrl: hostResourceUrl(addon.app, params.hostBaseUrl, 'js')
            });
        }

        next();
    }

    function hostResourceUrl(app, baseUrl, type) {
        var suffix = app.get('env') === 'development' ? '-debug' : '';
        return baseUrl + '/atlassian-connect/all' + suffix + '.' + type;
    }
}

proto.loadClientInfo = function(clientKey) {
    var self = this;
    return new RSVP.Promise(function(resolve, reject){
        self.settings.get('clientInfo', clientKey).then(function(d){
            resolve(d);
        }, function(err) {
            reject(err);
        });
    });
};

// Middleware to verify jwt token
proto.authenticate = function(){
    var self = this;

    return function(req, res, next){
        function send(code, msg) {
            self.logger.error('JWT verification error:', code, msg);
            res.send(code, msg);
        }

        function success(jwtToken, clientInfo) {
            if (jwtToken && jwtToken.iss && req.session) {
                req.session.clientKey = jwtToken.iss;
            }

            // Refresh the JWT token
            var now = Math.floor(Date.now()/1000);
            jwtToken.iat = now
            // Default maxTokenAge is 15m
            jwtToken.exp = now + (self.config.maxTokenAge() / 1000);
            res.locals.signed_request = jwt.encode(jwtToken, clientInfo.oauthSecret);
            res.set('x-acpt', res.locals.signed_request);

            req.context = jwtToken.context;
            req.clientInfo = clientInfo;
            next();
        }

        var signedRequest = req.query.signed_request || req.headers['x-acpt'];
        if (signedRequest) {
            try {
                // First get the oauthId from the JWT context by decoding it without verifying
                var unverifiedClaims = jwt.decode(signedRequest, null, true);

                var issuer = unverifiedClaims.iss;
                if (!issuer) {
                    send('JWT claim did not contain the issuer (iss) claim');
                    return;
                }

                // Then, let's look up the client's oauthSecret so we can verify the request
                self.loadClientInfo(issuer).then(function(clientInfo){
                    // verify the signed request
                    if (clientInfo === null) {
                        return send(400, "Request can't be verified without an OAuth secret");
                    }
                    var verifiedClaims = jwt.decode(signedRequest, clientInfo.oauthSecret);

                    // JWT expiry can be overriden using the `validityInMinutes` config.
                    // If not set, will use `exp` provided by HC server (default is 1 hour)
                    var now = Math.floor(Date.now()/1000);;
                    if (self.config.maxTokenAge()) {
                        var issuedAt = verifiedClaims.iat;
                        var expiresInSecs = self.config.maxTokenAge() / 1000;
                        if(issuedAt && now >= (issuedAt + expiresInSecs)){
                            send(401, 'Authentication request has expired.');
                            return;
                        }

                    } else {
                        var expiry = verifiedClaims.exp;
                        if (expiry && now >= expiry) { // default is 1 hour
                            send(401, 'Authentication request has expired.');
                            return;
                        }
                    }

                    success(verifiedClaims, clientInfo);
                }, function(err) {
                    return send(400, err.message);
                });
            } catch(e){
                return send(400, e.message);
            }
        } else if (req.body.oauth_client_id) {
            self.settings.get('clientInfo', req.body.oauth_client_id).then(function(d){
                try {
                    req.clientInfo = d;
                    req.context = req.body;
                    next();
                } catch(e){
                    return send(400, e.message);
                }
            });
        } else {
            return send(400, "Request not signed and therefore can't be verified");
        }
    }
}

module.exports = function(addon, app){
    return new HipChat(addon, app);
}
