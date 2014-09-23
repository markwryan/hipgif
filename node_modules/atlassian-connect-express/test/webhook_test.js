var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var logger = require('./logger');
var jwt = require('../lib/internal/jwt');
var sinon = require("sinon");
var moment = require("moment");
var addon = {};

describe('Webhook', function () {
    var server;
    var hostServer;
    var addonRegistered = false;

    before(function (done) {
        ac.store.register("teststore", function (logger, opts) {
            return require("../lib/store/jugglingdb")(logger, opts);
        });

        app.set('env', 'development');
        app.use(express.urlencoded());
        app.use(express.json());

        var installedPayload = helper.installedPayload;
        installedPayload.baseUrl = "http://admin:admin@localhost:3003";

        addon = ac(app, {
            config: {
                development: {
                    store: {
                        adapter: 'teststore',
                        type: "memory"
                    },
                    hosts: [ installedPayload.baseUrl ]
                }
            }
        }, logger);


        var host = express();
        // mock host
        host.get('/plugins/servlet/oauth/consumer-info', function (req, res) {
            res.set('Content-Type', 'application/xml');
            res.send(200, helper.consumerInfo);
        });

        host.head("/rest/plugins/1.0/", function (req, res) {
            res.setHeader("upm-token", "123");
            res.send(200);
        });

        host.get("/rest/plugins/1.0/", function(req, res) {
            res.json({plugins: []});
        });

        host.post("/rest/plugins/1.0/", function (req, res) {
            request({
                url: helper.addonBaseUrl + '/installed',
                qs: {
                    jwt: createValidJwtToken()
                },
                method: 'POST',
                json: installedPayload
            });
            res.send(200);
        });

        hostServer = http.createServer(host).listen(3003, function () {
            server = http.createServer(app).listen(helper.addonPort, function () {
                addon.register().then(done);
                addon.once('host_settings_saved', function () {
                    addonRegistered = true;
                });
            });
        });
    });

    after(function (done) {
        server.close();
        hostServer.close();
        done();
    });

    function createValidJwtToken(req) {
        var jwtPayload = {
            "iss": helper.installedPayload.clientKey,
            "iat": moment().utc().unix(),
            "exp": moment().utc().add('minutes', 10).unix()
        };

        if (req) {
            jwtPayload.qsh = jwt.createQueryStringHash(req);
        }

        return jwt.encode(jwtPayload, helper.installedPayload.sharedSecret);
    }

    function createExpiredJwtToken(req) {
        var jwtPayload = {
            "iss": helper.installedPayload.clientKey,
            "iat": moment().utc().subtract('minutes', 20).unix(),
            "exp": moment().utc().subtract('minutes', 10).unix()
        };

        if (req) {
            jwtPayload.qsh = jwt.createQueryStringHash(req);
        }

        return jwt.encode(jwtPayload, helper.installedPayload.sharedSecret);
    }

    function fireTestWebhook(route, body, assertWebhookResult, createJwtToken) {
        var url = helper.addonBaseUrl + route;

        var waitForRegistrationThenFireWebhook = function () {
            if (addonRegistered) {
                fireWebhook();
            } else {
                setTimeout(waitForRegistrationThenFireWebhook, 50);
            }
        };

        var requestMock = {
            method: 'post',
            path: route,
            query: {
                "user_id": "admin"
            }
        };

        var fireWebhook = function () {
            request.post({
                url: url,
                qs: {
                    "user_id": "admin",
                    "jwt": createJwtToken ? createJwtToken(requestMock) : createValidJwtToken(requestMock)
                },
                json: body
            }, assertWebhookResult);
        };

        waitForRegistrationThenFireWebhook();
    }

    function assertCorrectWebhookResult(err, res, body) {
        assert.equal(err, null);
        assert.equal(res.statusCode, 204, res.body);
    }

    it('should fire an add-on event', function (done) {
        addon.once('plugin_test_hook', function (event, body, req) {
            assert(event === 'plugin_test_hook');
            assert(body != null && body.foo === 'bar');
            assert(req && req.query['user_id'] === 'admin');
            done();
        });

        fireTestWebhook('/test-hook', {foo: 'bar'}, assertCorrectWebhookResult);
    });

    it('should perform auth verification for webhooks', function (done) {
        var triggered = sinon.spy();
        addon.once('webhook_auth_verification_triggered', triggered);
        var successful = sinon.spy();
        addon.once('webhook_auth_verification_successful', successful);

        addon.once('plugin_test_hook', function (key, body, req) {
            assert(triggered.called);
            assert(successful.called);
            done();
        });

        fireTestWebhook('/test-hook', {foo: 'bar'}, assertCorrectWebhookResult);
    });

    it('webhook with expired JWT claim should not be processed', function (done) {
        var triggered = sinon.spy();
        var successful = sinon.spy();
        var failed = sinon.spy();
        addon.once('webhook_auth_verification_triggered', triggered);
        addon.once('webhook_auth_verification_successful', successful);
        addon.once('webhook_auth_verification_failed', failed);

        addon.once('plugin_test_hook', function (key, body, req) {
            assert(triggered.called);
            assert(!successful.called);
            assert(failed.called);
        });

        fireTestWebhook('/test-hook', {foo: 'bar'}, function assertCorrectWebhookResult(err, res, body) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401, 'Status code for invalid token should be 401');
            assert.equal(body, 'Authentication request has expired.', 'Authentication expired error should be returned');
            done();
        }, createExpiredJwtToken);
    });

});
