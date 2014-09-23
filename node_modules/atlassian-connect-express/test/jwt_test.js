var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var moment = require('moment');
var qs = require('qs');
var jwt = require('../lib/internal/jwt');
var logger = require('./logger');

var addon = {};

describe('JWT', function () {
    var server;

    before(function (done) {
        app.set('env', 'development');
        app.use(express.urlencoded());
        app.use(express.json());

        // mock host
        app.get('/confluence/plugins/servlet/oauth/consumer-info', function (req, res) {
            res.set('Content-Type', 'application/xml');
            res.send(200, helper.consumerInfo);
        });

        app.head("/confluence/rest/plugins/1.0/", function (req, res) {
            res.setHeader("upm-token", "123");
            res.send(200);
        });

        app.get("/confluence/rest/plugins/1.0/", function(req, res) {
            res.json({plugins: []});
        });

        // Post request to UPM installer

        app.post("/confluence/rest/plugins/1.0/", function (req, res) {
            request({
                url: helper.addonBaseUrl + '/installed',
                query: {
                    jwt: createJwtToken()
                },
                method: 'POST',
                json: helper.installedPayload
            });
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
            addon.register().then(done);
        });
    });

    after(function (done) {
        server.close();
        done();
    });

    function createJwtToken() {
        var jwtPayload = {
            "sub": 'admin',
            "iss": helper.installedPayload.clientKey,
            "iat": moment().utc().unix(),
            "exp": moment().utc().add('minutes', 10).unix()
        };

        return jwt.encode(jwtPayload, helper.installedPayload.sharedSecret);
    }

    it('should correctly create canonical request', function (done) {

        var req = {
            method: 'get',
            path: '/path/to/service',
            query: qs.parse('zee_last=param&repeated=parameter 1&first=param&repeated=parameter 2&repeated=Parameter 2')
        };
        var expectedCanonical = "GET&/path/to/service&first=param&repeated=Parameter%202,parameter%201,parameter%202&zee_last=param";

        var canonical = jwt.createCanonicalRequest(req);
        assert.equal(canonical, expectedCanonical);
        done();
    });

    it('should correctly create canonical request ignoring add-on baseUrl', function (done) {

        var req = {
            method: 'get',
            path: '/base/path/to/service',
            query: qs.parse('zee_last=param&repeated=parameter 1&first=param&repeated=parameter 2&repeated=Parameter 2')
        };
        var expectedCanonical = "GET&/path/to/service&first=param&repeated=Parameter%202,parameter%201,parameter%202&zee_last=param";

        var canonical = jwt.createCanonicalRequest(req, false, 'https://bitbucket.org/base');
        assert.equal(canonical, expectedCanonical);
        done();
    });

    it('should correctly create canonical request ignoring jwt param', function (done) {

        var req = {
            method: 'get',
            path: '/hello-world',
            query: qs.parse('lic=none&tz=Australia%2FSydney&cp=%2Fjira&user_key=&loc=en-US&user_id=&jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjEzODY4OTkxMzEsImlzcyI6ImppcmE6MTU0ODk1OTUiLCJxc2giOiI4MDYzZmY0Y2ExZTQxZGY3YmM5MGM4YWI2ZDBmNjIwN2Q0OTFjZjZkYWQ3YzY2ZWE3OTdiNDYxNGI3MTkyMmU5IiwiaWF0IjoxMzg2ODk4OTUxfQ.uKqU9dTB6gKwG6jQCuXYAiMNdfNRw98Hw_IWuA5MaMo&xdm_e=http%3A%2F%2Fstorm%3A2990&xdm_c=channel-servlet-hello-world&xdm_p=1')
        };
        var expectedCanonical = "GET&/hello-world&cp=%2Fjira&lic=none&loc=en-US&tz=Australia%2FSydney&user_id=&user_key=&xdm_c=channel-servlet-hello-world&xdm_e=http%3A%2F%2Fstorm%3A2990&xdm_p=1";

        var canonical = jwt.createCanonicalRequest(req, false, '');
        assert.equal(canonical, expectedCanonical);
        done();
    });

    // If the separator is not URL encoded then the following URLs have the same query-string-hash:
    //   https://djtest9.jira-dev.com/rest/api/2/project&a=b?x=y
    //   https://djtest9.jira-dev.com/rest/api/2/project?a=b&x=y
    describe('paths containing "&" characters should not have spoof-able qsh claims', function () {

        it('requests that differ by ampersands in the path versus query-string do not have the same canonical request string', function (done) {
            var req1 = {
                method: 'post',
                path: '/rest/api/2/project&a=b',
                query: qs.parse('x=y'),
                body: ''
            };
            var req2 = {
                method: 'post',
                path: '/rest/api/2/project',
                query: qs.parse('a=b&x=y'),
                body: ''
            };

            assert.notEqual(jwt.createCanonicalRequest(req1, false, ''), jwt.createCanonicalRequest(req2, false, ''));
            done();
        });

        it('an ampersand in the path is url-encoded', function (done) {
            var req = {
                method: 'post',
                path: '/rest/api/2/project&a=b',
                query: qs.parse('x=y'),
                body: ''
            };

            assert.equal(jwt.createCanonicalRequest(req, false, ''), 'POST&/rest/api/2/project%26a=b&x=y');
            done();
        });

        it('multiple ampersands in the path are encoded', function (done) {
            var req = {
                method: 'post',
                path: '/rest/api/2/project&a=b&c=d',
                query: qs.parse('x=y'),
                body: ''
            };

            assert.equal(jwt.createCanonicalRequest(req, false, ''), 'POST&/rest/api/2/project%26a=b%26c=d&x=y');
            done();
        });
    });

    it('should correctly create qsh without query string', function (done) {

        var req = {
            method: 'get',
            path: '/path'
        };
        var expectedHash = "799be84a7fa35570087163c0cd9af3abff7ac05c2c12ba0bb1d7eebc984b3ac2";

        var qsh = jwt.createQueryStringHash(req);
        assert.equal(qsh, expectedHash);
        done();
    });

    it('should correctly create qsh without path or query string', function (done) {

        var req = {
            method: 'get'
        };
        var expectedHash = "c88caad15a1c1a900b8ac08aa9686f4e8184539bea1deda36e2f649430df3239";

        var qsh = jwt.createQueryStringHash(req);
        assert.equal(qsh, expectedHash);
        done();
    });

    it('should correctly create qsh with empty path and no query string', function (done) {

        var req = {
            method: 'get',
            path: '/'
        };
        var expectedHash = "c88caad15a1c1a900b8ac08aa9686f4e8184539bea1deda36e2f649430df3239";

        var qsh = jwt.createQueryStringHash(req);
        assert.equal(qsh, expectedHash);
        done();
    });

    it('should correctly create qsh with query string', function (done) {

        var req = {
            method: 'get',
            path: '/hello-world',
            query: qs.parse('lic=none&tz=Australia%2FSydney&cp=%2Fjira&user_key=&loc=en-US&user_id=&jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjEzODY5MTEzNTYsImlzcyI6ImppcmE6MTU0ODk1OTUiLCJxc2giOiI4MDYzZmY0Y2ExZTQxZGY3YmM5MGM4YWI2ZDBmNjIwN2Q0OTFjZjZkYWQ3YzY2ZWE3OTdiNDYxNGI3MTkyMmU5IiwiaWF0IjoxMzg2OTExMTc2fQ.rAsxpHv0EvpXkhjnZnSV14EXJgDx3KSQjgYRjfKnFt8&xdm_e=http%3A%2F%2Fstorm%3A2990&xdm_c=channel-servlet-hello-world&xdm_p=1')
        };
        var expectedHash = "8063ff4ca1e41df7bc90c8ab6d0f6207d491cf6dad7c66ea797b4614b71922e9";

        var qsh = jwt.createQueryStringHash(req);
        assert.equal(qsh, expectedHash);
        done();
    });

    // apache http client likes to do this
    it('should correctly create qsh with POST body query string', function (done) {
        var req = {
            method: 'post',
            path: '/hello-world',
            query: {},
            body: qs.parse('lic=none&tz=Australia%2FSydney&cp=%2Fjira&user_key=&loc=en-US&user_id=&jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjEzODY5MTEzNTYsImlzcyI6ImppcmE6MTU0ODk1OTUiLCJxc2giOiI4MDYzZmY0Y2ExZTQxZGY3YmM5MGM4YWI2ZDBmNjIwN2Q0OTFjZjZkYWQ3YzY2ZWE3OTdiNDYxNGI3MTkyMmU5IiwiaWF0IjoxMzg2OTExMTc2fQ.rAsxpHv0EvpXkhjnZnSV14EXJgDx3KSQjgYRjfKnFt8&xdm_e=http%3A%2F%2Fstorm%3A2990&xdm_c=channel-servlet-hello-world&xdm_p=1')
        };
        var expectedHash = "d7e7f00660965fc15745b2c423a89b85d0853c4463faca362e0371d008eb0927";

        var qsh = jwt.createQueryStringHash(req, true);
        assert.equal(qsh, expectedHash);
        done();
    });

    // apache http client likes to do this
    it('should not correctly create qsh with POST body query string if not instructed to', function (done) {
        var req = {
            method: 'post',
            path: '/hello-world',
            query: {},
            body: qs.parse('lic=none&tz=Australia%2FSydney&cp=%2Fjira&user_key=&loc=en-US&user_id=&jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjEzODY5MTEzNTYsImlzcyI6ImppcmE6MTU0ODk1OTUiLCJxc2giOiI4MDYzZmY0Y2ExZTQxZGY3YmM5MGM4YWI2ZDBmNjIwN2Q0OTFjZjZkYWQ3YzY2ZWE3OTdiNDYxNGI3MTkyMmU5IiwiaWF0IjoxMzg2OTExMTc2fQ.rAsxpHv0EvpXkhjnZnSV14EXJgDx3KSQjgYRjfKnFt8&xdm_e=http%3A%2F%2Fstorm%3A2990&xdm_c=channel-servlet-hello-world&xdm_p=1')
        };
        var expectedHash = "6f95f3738e1b037a3bebbe0ad237d80fdbc1d5ae452e98ce03a9c004c178ebb4";

        var qsh = jwt.createQueryStringHash(req, false);
        assert.equal(qsh, expectedHash);
        done();
    });
});
