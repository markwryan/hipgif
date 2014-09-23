var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var jwt = require('../lib/internal/jwt');
var logger = require('./logger');
var moment = require("moment");
var addon = {};

describe('Auto registration (UPM)', function () {
    var server = {};
    var regPromise;

    before(function (done) {
        app.set('env', 'development');
        app.use(express.urlencoded());
        app.use(express.json());

        // mock host
        app.get('/confluence/plugins/servlet/oauth/consumer-info', function (req, res) {
            res.set('Content-Type', 'application/xml');
            res.send(200, helper.consumerInfo);
        });

        app.head("/rest/plugins/1.0/", function (req, res) {
            res.setHeader("upm-token", "123");
            res.send(200);
        });

        // Post request to UPM installer
        app.post("/confluence/rest/plugins/1.0/", function (req, res) {
            request({
                url: helper.addonBaseUrl + '/installed',
                qs: {
                    jwt: createJwtToken()
                },
                method: 'POST',
                json: helper.installedPayload
            });
            res.send(200);
        });

        app.delete(/plugins\/1.0\/(.*?)-key/, function (req, res) {
            res.send(200);
        });

        ac.store.register("teststore", function (logger, opts) {
            return require("../lib/store/jugglingdb")(logger, opts);
        });

        addon = ac(app, {
            config: {
                "development": {
                    store: {
                        adapter: 'teststore',
                        type: "memory"
                    },
                    "hosts": [
                        helper.productBaseUrl
                    ]
                }
            }
        }, logger);
        server = http.createServer(app).listen(helper.addonPort, function () {
            regPromise = addon.register().then(done);
        });
    });

    after(function (done) {
        server.close();
        done();
    });

    function createJwtToken() {
        var jwtPayload = {
            "iss": helper.installedPayload.clientKey,
            "iat": moment().utc().unix(),
            "exp": moment().utc().add('minutes', 10).unix()
        };

        return jwt.encode(jwtPayload, helper.installedPayload.sharedSecret);
    }

    function testIfEventCalled(spy, done) {
        return setTimeout(function () {
            assert(false, 'Event never fired');
            done();
        }, 1000);
    }

    function eventFired(timer, done, cb) {
        clearTimeout(timer);
        assert(true, "Event fired");
        if (cb) {
            cb(done);
        }
        else {
            done();
        }
    }

    it('event fired when addon.register() is called', function (done) {
        var timer = testIfEventCalled();
        regPromise.then(function () {
            eventFired(timer, done);
        });
    });

//    it('should also deregister if a SIGINT is encountered', function (done) {
//        // first sigint will be us testing deregistration
//        function trap() {
//            // second sigint will be deregistration sending another to kill the process after
//            // it completes it's work; we don't want the tests to exit, so we'll no-op that
//            process.once('SIGINT', function () {
//                // a third sigint can occur on test failures (why?), so this ensures that we see
//                // the full error emitted before the tests terminate
//                process.once('SIGINT', function () {
//                    process.once('SIGINT', function () {
//                    });
//                });
//            });
//        }
//
//        process.once('SIGINT', trap);
//        process.kill(process.pid, 'SIGINT');
//        var timer = testIfEventCalled();
//        addon.on('addon_deregistered', function () {
//            eventFired(timer, done, function () {
//                addon.settings.get(helper.installedPayload.clientKey).then(function (settings) {
//                    assert(!settings, 'settings not deleted: ' + require('util').inspect(settings));
//                    done();
//                });
//            });
//        });
//    });

});
