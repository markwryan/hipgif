var request = require('request');
var urls = require('url');
var _ = require('lodash');
var RSVP = require('rsvp');
var lt = require('localtunnel');
var hostInfo = require('./host-info');
var errmsg = require('./errors').errmsg;

function createTunnel(addon) {
    return new RSVP.Promise(function (resolve, reject) {
        var nonLocalHosts = [];
        if (process.env.AC_LOCAL_BASE_URL) {
            resolve();
        } else {
            nonLocalHosts = _.filter(addon.config.hosts(), function (host) {
                return !/localhost/.test(host);
            });
        }
        if (nonLocalHosts.length > 0) {
            var client = lt.connect({
                host: 'http://localtunnel.me',
                port: addon.config.port()
            });
            client.on('url', function (url) {
                var ltu = urls.parse(url);
                var lbu = urls.parse(addon.config.localBaseUrl());
                lbu.protocol = ltu.protocol;
                lbu.host = ltu.host;
                process.env.AC_LOCAL_BASE_URL = urls.format(lbu);
                addon.logger.info('Local tunnel established at ' + url);
                addon.emit('localtunnel_started');
                resolve();
            });

            client.on('error', function (err) {
                addon.logger.error('Failed to establish local tunnel');
                reject(err && err.stack ? err : new Error(err));
            });
        } else {
            resolve();
        }
    });
}

exports.shouldRegister = function() {
    return /force-reg/.test(process.env.AC_OPTS) || this.settings.isMemoryStore();
};

exports.shouldDeregister = function() {
    return /force-dereg/.test(process.env.AC_OPTS) || this.settings.isMemoryStore();
};

exports.register = function (isReregistration) {
    var self = this;
    return new RSVP.Promise(function (resolve, reject) {
        if (/no-reg/.test(process.env.AC_OPTS)) {
            self.logger.warn('Auto-registration disabled with AC_OPTS=no-reg');
            return resolve();
        }
        self._registrations = {};
        var hostRegUrls = self.config.hosts();
        createTunnel(self).then(
                function () {
                    if (hostRegUrls && hostRegUrls.length > 0) {
                        if (!isReregistration) {
                            self.logger.info('Registering add-on...');
                            process.once('SIGINT', function () {
                                console.log();
                                function sigint() {
                                    process.kill(process.pid, 'SIGINT');
                                }

                                self.deregister()
                                        .then(
                                        function () {
                                            self.emit('addon_deregistered');
                                            sigint();
                                        },
                                        function () {
                                            self.logger.error.apply(self.logger, arguments);
                                            sigint();
                                        }
                                );
                            });
                        }
                        var forceRegistration = self.shouldRegister() || isReregistration;
                        RSVP.all(hostRegUrls.map(_.bind(register, self, forceRegistration))).then(
                                function () {
                                    var count = _.keys(self._registrations).length;
                                    if (count === 0) {
                                        self.logger.warn('Add-on not registered; no compatible hosts detected');
                                    }
                                    resolve();
                                    self.emit('addon_registered');
                                }
                        );
                    }
                },
                function (err) {
                    console.log("err = " + err);
                    self.logger.error(errmsg(err));
                    reject(err);
                }
        );
    });
};

exports.deregister = function () {
    var self = this;
    var hostRegUrls = _.keys(self._registrations);
    var promise;
    if (hostRegUrls.length > 0 && self.shouldDeregister()) {
        self.logger.info('Deregistering add-on...');
        promise = RSVP.all(hostRegUrls.map(_.bind(deregister, self)));
    }
    else {
        // will be just RSVP.resolve() in v2.x
        promise = new RSVP.Promise(function (resolve) {
            resolve();
        });
    }
    return promise;
};

function register(forceRegistration, hostRegUrl) {
    var self = this;

    var localUrl = urls.parse(self.config.localBaseUrl());
    localUrl.pathname = [localUrl.pathname, 'atlassian-connect.json'].join('');
    var descriptorUrl = urls.format(localUrl);
    descriptorUrl = descriptorUrl.replace("//v2", '/');
    return new RSVP.Promise(function (resolve, reject) {
        hostInfo.get({
            baseUrl: hostRegUrl,
            timeout: 5000
        }).then(
                function (info) {
                    var clientKey = info.key;

                    function done() {
                        var hostBaseUrl = stripCredentials(hostRegUrl);
                        self.logger.info('Registered with host ' + clientKey + ' at ' + hostBaseUrl);
                        self._registrations[hostRegUrl] = clientKey;
                        resolve();
                    }

                    function fail(args) {
                        self.logger.error(registrationError('register', clientKey, args[0], args[1]));
                        resolve();
                    }

                    registerUpm(hostRegUrl, descriptorUrl, self.descriptor.key, forceRegistration).then(done, fail);
                },
                function () {
                    // ignore connection errors as registration no-ops
                    resolve();
                }
        );
    });
}

function checkUpmRegistered(hostRegUrl, pluginKey) {
    return new RSVP.Promise(function (resolve, reject) {
        request.get({
            uri: hostRegUrl + '/rest/plugins/1.0/',
            jar: false
        }, function(err, res, body) {
            if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
                return reject(err);
            }
            body = JSON.parse(body);
            if (body && body.plugins) {
                resolve(_.some(body.plugins, function(plugin) {
                    return plugin.key == pluginKey;
                }));
            }
        });
    });
    
}

function registerUpm(hostRegUrl, descriptorUrl, pluginKey, forceRegistration) {
    return new RSVP.Promise(function (resolve, reject) {
        request.head({
            uri: hostRegUrl + '/rest/plugins/1.0/',
            jar: false
        }, function (err, res) {
            if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
                return reject([err, res]);
            }

            function doReg() {
                var upmToken = res.headers['upm-token'];
                request.post({
                    uri: hostRegUrl + '/rest/plugins/1.0/?token=' + upmToken,
                    headers: {'content-type': 'application/vnd.atl.plugins.remote.install+json'},
                    body: JSON.stringify({pluginUri: descriptorUrl}),
                    jar: false
                }, function (err, res) {
                    if (err || (res && res.statusCode !== 202)) {
                        return reject([err, res]);
                    }
                    resolve();
                });
            }

            if (forceRegistration) {
                doReg();
            } else {
                checkUpmRegistered(hostRegUrl, pluginKey).then(function(registered) {
                    if (registered) {
                        resolve();
                        return;
                    }
                    doReg();
                }).catch(reject);
            }
        });

    });
}

function deregister(hostRegUrl) {
    var self = this;
    var clientKey = self._registrations[hostRegUrl];
    return new RSVP.Promise(function (resolve, reject) {
        function done() {
            var hostBaseUrl = stripCredentials(hostRegUrl);
            self.logger.info('Unregistered on host ' + clientKey + ' at ' + hostBaseUrl);
            self.settings.del(clientKey).then(
                    function () {
                        resolve();
                    },
                    function (err) {
                        self.logger.error(errmsg(err));
                        resolve();
                    }
            );
        }

        function fail(args) {
            self.logger.error(registrationError('deregister', clientKey, args[0], args[1]));
            resolve();
        }

        if (clientKey) {
            deregisterUpm(self, hostRegUrl, clientKey).then(done, fail);
        }
        else {
            resolve();
        }
    });
}

function deregisterUpm(self, hostRegUrl, clientKey) {
    return new RSVP.Promise(function (resolve, reject) {
        request.del({
            uri: hostRegUrl + '/rest/plugins/1.0/' + self.key + '-key',
            jar: false
        }, function (err, res) {
            if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
                return reject([err, res]);
            }
            resolve();
        });
    });
}

function registrationError(action, clientKey, err, res) {
    var args = ['Failed to ' + action + ' with host ' + clientKey];
    if (res && res.statusCode) {
        args[0] = args[0] + (' (' + res.statusCode + ')');
    }
    if (err) {
        args.push(errmsg(err));
    }
    if (res && res.body && !/^<[^h]*html[^>]*>/i.test(res.body)) {
        args.push(res.body);
    }
    return args.join('\n');
}

function stripCredentials(url) {
    url = urls.parse(url);
    delete url.auth;
    return urls.format(url);
}
