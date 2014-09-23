var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var moment = require('moment');
var jwt = require('../lib/internal/jwt');
var hostRequest = require('../lib/internal/host-request');
var logger = require('./logger');
var addon = {};

describe('Host Request', function () {
    var server;
    var httpClient;

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

        var settings = {
            'sharedSecret': helper.installedPayload.sharedSecret,
            'baseUrl': helper.productBaseUrl
        };
        addon.settings.set('clientInfo', settings, helper.installedPayload.clientKey);
        httpClient = hostRequest(addon, { 'userKey': 'admin' }, helper.installedPayload.clientKey);
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

    it('constructs non-null get request', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            assert.ok(request);
            done();
        });
    });

    it('get request has headers', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            assert.ok(request.headers);
            done();
        });
    });

    it('get request has Authorization header', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            assert.ok(request.headers['Authorization']);
            done();
        });
    });

    it('get request has Authorization header starting with "JWT "', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            assert.equal(request.headers['Authorization'].indexOf('JWT '), 0);
            done();
        });
    });

    it('get request has correct JWT subject claim', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            var jwtToken = request.headers['Authorization'].slice(4);
            var decoded = jwt.decode(jwtToken, helper.installedPayload.clientKey, true);
            assert.equal(decoded.sub, 'admin');
            done();
        });
    });

    it('get request has correct JWT qsh for encoded parameter', function (done) {
        httpClient.get('/some/path/on/host?q=~%20text').then(function(request) {
            var jwtToken = request.headers['Authorization'].slice(4);
            var decoded = jwt.decode(jwtToken, helper.installedPayload.clientKey, true);
            var expectedQsh = jwt.createQueryStringHash({
              'method': 'GET',
              'path'  : '/some/path/on/host',
              'query' : { 'q' : '~ text'}
            }, false, helper.productBaseUrl);
            assert.equal(decoded.qsh, expectedQsh);
            done();
        });
    });

    it('post request has correct url', function (done) {
        var relativeUrl = '/some/path/on/host';
        httpClient.post(relativeUrl).then(function(request) {
            assert.equal(request.uri.href, helper.productBaseUrl + relativeUrl);
            done();
        });
    });

    it('post request preserves custom header', function (done) {
        httpClient.post({
            'url': '/some/path',
            'headers': {
                'custom_header': 'arbitrary value'
            }
        }).then(function(request) {
            assert.equal(request.headers['custom_header'], 'arbitrary value');
            done();
        });
    });

    it('post request with form sets form data', function (done) {
        httpClient.post({
            'url': '/some/path',
            file: [
                'file content', {
                    filename: 'filename',
                    ContentType: 'text/plain'
                }
            ]
        }).then(function(request) {
            assert.deepEqual(request.file, ["file content",{"filename":"filename","ContentType":"text/plain"}]);
            done();
        });
    });


    it('post requests using multipartFormData have the right format', function (done) {
        var someData = 'some data';
        httpClient.post({
            url: '/some/path',
            multipartFormData: {
                file: [someData, { filename:'myattachmentagain.png' }]
            }
        }).then(function(request) {
            assert.ok(request._form);
            assert.equal(request._form._valueLength, someData.length);
            done();
        });
    });

    it('post requests using the deprecated form parameter still have the right format', function (done) {
        var someData = 'some data';
        httpClient.post({
            url: '/some/path',
            form: {
                file: [someData, { filename:'myattachmentagain.png' }]
            }
        }).then(function(request) {
            assert.ok(request._form);
            assert.equal(request._form._valueLength, someData.length);
            done();
        });
    });

    it('post requests using urlEncodedFormData have the right format', function (done) {
        httpClient.post({
            url: '/some/path',
            urlEncodedFormData: {
                param1: 'value1'
            }
        }).then(function(request) {
            assert.equal(request.body.toString(), 'param1=value1');
            done();
        });
    });
});
