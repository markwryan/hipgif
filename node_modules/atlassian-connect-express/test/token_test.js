var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var moment = require('moment');
var jwt = require('../lib/internal/jwt');
var logger = require('./logger');

var addon = {};

var USER_ID = 'admin';
var JWT_AUTH_RESPONDER_PATH = '/jwt_auth_responder';
var CHECK_TOKEN_RESPONDER_PATH = '/check_token_responder';

describe('Token verification', function () {
    var server;

    before(function (done) {
        app.set('env', 'development');
        app.use(express.urlencoded());
        app.use(express.json());

        // configure test store
        ac.store.register("teststore", function (logger, opts) {
            return require("../lib/store/jugglingdb")(logger, opts);
        });

        // configure add-on
        addon = ac(app, {
            config: {
                "development": {
                    store: {
                        adapter: 'teststore',
                        type: "memory"
                    },
                    "hosts": [
                        helper.productBaseUrl
                    ],
                    "validatePublicKey": false
                }
            }
        }, logger, function() {
            request({
                url: helper.addonBaseUrl + '/installed',
                method: 'POST',
                json: helper.installedPayload
            }, function (err, res, body) {
                assert.equal(res.statusCode, 204, "Install hook failed");
                done();
            });
        });

        // default test routes
        app.get(
            JWT_AUTH_RESPONDER_PATH,
            addon.authenticate(),
            function (req, res) {
                var token = res.locals.token;
                res.send(token);
            }
        );

        app.get(
            CHECK_TOKEN_RESPONDER_PATH,
            addon.checkValidToken(),
            function (req, res) {
                var token = res.locals.token;
                res.send(token);
            }
        );

        // start server
        server = http.createServer(app).listen(helper.addonPort);
    });

    after(function (done) {
        server.close();
        done();
    });

    function createJwtToken(req) {
        var jwtPayload = {
            "sub": USER_ID,
            "iss": helper.installedPayload.clientKey,
            "iat": moment().utc().unix(),
            "exp": moment().utc().add('minutes', 10).unix()
        };

        if (req) {
            jwtPayload.qsh = jwt.createQueryStringHash(req);
        }

        return jwt.encode(jwtPayload, helper.installedPayload.sharedSecret);
    }

    function createRequestOptions(path, jwt) {
        return {
            qs: {
                "xdm_e": helper.productBaseUrl,
                "jwt": jwt || createJwtToken({
                    // mock the request
                    method: 'get',
                    path: path,
                    query: {
                        "xdm_e": helper.productBaseUrl
                    }
                })
            },
            jar: false
        };
    }

    function createTokenRequestOptions(token) {
        return {
            qs: {
                "acpt": token
            },
            jar: false
        };
    }

    function isBase64EncodedJson(value) {
        return value && (value.indexOf("ey") == 0)
    }

    it('should generate a token for authenticated requests', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

        request(requestUrl, requestOpts, function (err, res, body) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);
            assert.ok(isBase64EncodedJson(body));
            assert.ok(isBase64EncodedJson(res.headers['x-acpt']));
            done();
        });
    });

    it('should not create tokens for unauthenticated requests', function (done) {
        app.get(
            '/unprotected',
            function (req, res) {
                res.send(undefined === res.locals.token ? "no token" : res.locals.token);
            }
        );

        var requestUrl = helper.addonBaseUrl + '/unprotected';
        var requestOpts = {
            qs: {
                "xdm_e": helper.productBaseUrl,
                "user_id": USER_ID
            },
            jar: false
        };
        request(requestUrl, requestOpts, function (err, res, body) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);
            assert.equal(body, "no token");
            done();
        });
    });

    it('should preserve the clientKey and user from the original signed request', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

        request(requestUrl, requestOpts, function (err, res, theToken) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);

            var verifiedToken = jwt.decode(theToken, helper.installedPayload.sharedSecret);
            assert.equal(verifiedToken.aud[0], helper.installedPayload.clientKey);
            assert.equal(verifiedToken.sub, USER_ID);
            done();
        });
    });

    it('should allow requests with valid tokens using the checkValidToken middleware', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

        request(requestUrl, requestOpts, function (err, res, theToken) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);

            var tokenUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
            var tokenRequestOpts = createTokenRequestOptions(theToken);

            request(tokenUrl, tokenRequestOpts, function (err, res, body) {
                assert.equal(err, null);
                assert.equal(res.statusCode, 200);
                done();
            });
        });
    });

    it('should not allow requests with valid tokens using the authenticate middleware', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

        request(requestUrl, requestOpts, function (err, res, theToken) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);

            var tokenUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
            var tokenRequestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH, theToken);

            request(tokenUrl, tokenRequestOpts, function (err, res, body) {
                assert.equal(err, null);
                assert.equal(res.statusCode, 401);
                done();
            });
        });
    });

    it('should reject requests with no token', function (done) {
        var requestUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
        request(requestUrl, {jar: false}, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401);
            done();
        });
    });

    it('should reject requests with invalid tokens', function (done) {
        var requestUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
        var requestOpts = createTokenRequestOptions("invalid");
        request(requestUrl, requestOpts, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401);
            done();
        });
    });

    it('should rehydrate response local variables from the token', function (done) {
        app.get(
            '/protected_resource',
            addon.checkValidToken(),
            function (req, res) {
                res.send({
                    clientKey: res.locals.clientKey,
                    token: res.locals.token,
                    userId: res.locals.userId,
                    hostBaseUrl: res.locals.hostBaseUrl,
                    hostStylesheetUrl: res.locals.hostStylesheetUrl,
                    hostScriptUrl: res.locals.hostScriptUrl
                });
            }
        );

        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

        request(requestUrl, requestOpts, function (err, res, theToken) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);

            var tokenUrl = helper.addonBaseUrl + '/protected_resource';
            var tokenRequestOpts = createTokenRequestOptions(theToken);

            request(tokenUrl, tokenRequestOpts, function (err, res, body) {
                var payload = JSON.parse(body);
                assert.equal(null, err);
                assert.equal(200, res.statusCode);
                assert.equal(payload.clientKey, helper.installedPayload.clientKey);
                assert.equal(payload.userId, USER_ID);
                assert.equal(payload.hostBaseUrl, helper.productBaseUrl);
                assert.equal(payload.hostStylesheetUrl, hostResourceUrl(app, helper.productBaseUrl, 'css'));
                assert.equal(payload.hostScriptUrl, hostResourceUrl(app, helper.productBaseUrl, 'js'));
                jwt.decode(payload.token, helper.installedPayload.sharedSecret);
                done();
            });
        });
    });

    function hostResourceUrl(app, baseUrl, type) {
        var suffix = app.get('env') === 'development' ? '-debug' : '';
        return baseUrl + '/atlassian-connect/all' + suffix + '.' + type;
    }

});
