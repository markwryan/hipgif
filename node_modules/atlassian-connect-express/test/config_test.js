var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var config = require('../lib/internal/config');
var logger = require('./logger');
var addon = {};

describe('Configuration', function () {
    var server = {};

    before(function (done) {
        app.set('env', 'development');
        addon = ac(app, {
            config: {
                "customShadowed": "global",
                "customGlobal": "foo",
                "development": {
                    "watch": false,
                    "customShadowed": "env",
                    "customEnv": "bar"
                }
            }
        }, logger);
        server = http.createServer(app).listen(3001, function () {
            done();
        });
    });

    after(function (done) {
        server.close();
        done();
    });

    it('should be parsed as an object', function (done) {
        assert.equal(typeof addon.config, 'object');
        done();
    });

    it('should allow you to disable re-registration on plugin.xml change', function (done) {
        assert(!addon.config.watch());
        done();
    });

    it('should allow prefer env values over globals', function (done) {
        assert.equal(addon.config.customShadowed(), "env");
        done();
    });

    it('should allow access to custom global values', function (done) {
        assert.equal(addon.config.customGlobal(), "foo");
        done();
    });

    it('should allow access to custom env-specific values', function (done) {
        assert.equal(addon.config.customEnv(), "bar");
        done();
    });

    describe('Whitelist', function() {

        it('should accept single-segment hostnames in dev mode', function (done) {
            assert(matches(addon.config, 'localhost'));
            done();
        });

        it('should accept multi-segment hostnames in dev mode', function (done) {
            assert(matches(addon.config, 'machine.dyn.syd.atlassian.com'));
            done();
        });

        it('should accept fully qualified domain names', function (done) {
            var cfg = createWhiteListConfig("*.atlassian.net");
            assert(matches(cfg, 'connect.atlassian.net'));
            done();
        });

        it('should not accept partial domain name matches', function (done) {
            var cfg = createWhiteListConfig("*.jira.com");
            assert(!matches(cfg, 'test.jira.com.hh.ht'));
            done();
        });

        it('should not accept subdomains', function (done) {
            var cfg = createWhiteListConfig("*.jira.com");
            assert(!matches(cfg, 'foo.test.jira.com'));
            done();
        });

        it('should accept multiple comma separated patterns', function (done) {
            var cfg = createWhiteListConfig("*.jira.com, *.atlassian.net");
            assert(matches(cfg, 'connect.jira.com'));
            assert(matches(cfg, 'connect.atlassian.net'));
            assert(!matches(cfg, 'connect.jira-dev.com'));
            done();
        });

        function matches(cfg, host) {
            return cfg.whitelistRegexp().some(function (re) { return re.test(host); });
        }

        function createWhiteListConfig(domain) {
            return config("development", { "development": { "whitelist": domain }});
        }
    });

});
