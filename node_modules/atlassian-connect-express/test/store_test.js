var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var RSVP = require('rsvp');
var Schema = require('jugglingdb').Schema;
var logger = require('./logger');
var spy = require("sinon").spy;
var addon = {};

describe('Store', function () {
    var server = {};
    var oldACOpts = process.env.AC_OPTS;

    var storeGetSpy;
    var storeSetSpy;
    var storeDelSpy;

    before(function (done) {
        process.env.AC_OPTS = 'no-auth';
        app.set('env', 'development');
        app.use(express.urlencoded());
        app.use(express.json());

        app.get('/confluence/plugins/servlet/oauth/consumer-info', function (req, res) {
            res.set('Content-Type', 'application/xml');
            res.send(200, helper.consumerInfo);
        });

        // Head request to UPM installer
        app.head(/rest/, function (req, res) {
            res.send(200);
        });

        app.get("/confluence/rest/plugins/1.0/", function(req, res) {
            res.json({plugins: []});
        });

        // Post request to UPM installer
        app.post("/confluence/rest/plugins/1.0/", function (req, res) {
            request({
                url: helper.addonBaseUrl + '/installed',
                method: 'POST',
                json: helper.installedPayload
            });
            res.send(200);
        });

        ac.store.register("teststore", function (logger, opts) {
            var JugglingDB = require("../lib/store/jugglingdb")();
            storeGetSpy = spy(JugglingDB.prototype, "get");
            storeSetSpy = spy(JugglingDB.prototype, "set");
            storeDelSpy = spy(JugglingDB.prototype, "del");
            return new JugglingDB(logger, opts);
        });

        addon = ac(app, {
            config: {
                development: {
                    store: {
                        adapter: "teststore",
                        type: "memory"
                    },
                    hosts: [ helper.productBaseUrl ]
                }
            }
        }, logger);

        server = http.createServer(app).listen(helper.addonPort, function () {
            addon.register().then(done);
        });
    });

    after(function (done) {
        process.env.AC_OPTS = oldACOpts;
        server.close();
        done();
    });

    it('should store client info', function (done) {
        addon.on('host_settings_saved', function (clientKey, settings) {
            addon.settings.get('clientInfo', helper.installedPayload.clientKey).then(function (settings) {
                assert.equal(settings.clientKey, helper.installedPayload.clientKey);
                assert.equal(settings.sharedSecret, helper.installedPayload.sharedSecret);
                done();
            });
        });
    });

    it('should allow storing arbitrary key/values', function (done) {
        addon.settings.set('arbitrarySetting', 'someValue', helper.installedPayload.clientKey).then(function (setting) {
            assert.equal(setting, 'someValue');
            done();
        })
    });

    it('should allow storing arbitrary key/values as JSON', function (done) {
        addon.settings.set('arbitrarySetting2', {data: 1}, helper.installedPayload.clientKey).then(function (setting) {
            assert.deepEqual(setting, {data: 1});
            done();
        })
    });

    it('should allow storage of arbitrary models', function (done) {
        addon.schema.extend('User', {
            name: String,
            email: String,
            bio: Schema.JSON
        }).then(
                function (User) {
                    User.create({
                        name: "Rich",
                        email: "rich@example.com",
                        bio: {
                            description: "Male 6' tall",
                            favoriteColors: [
                                "blue",
                                "green"
                            ]
                        }
                    }, function (err, model) {
                        assert.equal(model.name, "Rich");
                        User.all({ name: "Rich" }, function (err, user) {
                            assert.equal(user[0].name, model.name);
                            done();
                        });
                    });
                },
                function (err) {
                    assert.fail(err.toString());
                }
        );
    });

    it('should work with a custom store', function (done) {
        var promises = [
            addon.settings.set('custom key', 'custom value'),
            addon.settings.get('custom key'),
            addon.settings.del('custom key')
        ];
        RSVP.all(promises).then(function () {
            assert.ok(storeSetSpy.callCount > 0);
            assert.ok(storeGetSpy.callCount > 0);
            assert.ok(storeDelSpy.callCount > 0);
            done();
        }, function (err) {
            assert.fail(err);
        });
    });

});