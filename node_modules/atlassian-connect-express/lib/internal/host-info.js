var request = require('request');
var RSVP = require('rsvp');
var parseXml = require('xml2js').parseString;
var _ = require('lodash');

exports.get = function (requestOptions) {
    return new RSVP.Promise(function (resolve, reject) {
        if (!requestOptions.baseUrl) {
            return reject("No base url supplied");
        }
        requestOptions.url = requestOptions.baseUrl + '/plugins/servlet/oauth/consumer-info';

        request.get(requestOptions, function (err, res) {
            if (err) {
                return reject(err);
            }
            var code = res.statusCode;
            if (code !== 200) {
                return reject(new Error('Unexpected host info response ' + code));
            }
            var contentType = res.headers['content-type'];
            if (contentType.indexOf('application/xml') !== 0) {
                return reject(new Error('Unexpected host info response format ' + contentType));
            }
            if (!res.body) {
                return reject(new Error('No host info response body'));
            }
            try {
                var info;
                parseXml(res.body, {async: false}, function (err, json) {
                    if (err) {
                        throw err;
                    }
                    info = json;
                });
                if (info == null || info.consumer == null) {
                    return reject(new Error('Unexpected response data ' + JSON.stringify(info)));
                }
                var consumer = _.object(_.keys(info.consumer).map(function (k) {
                    var v = info.consumer[k];
                    v = Array.isArray(v) ? v[0] : v;
                    return [k, v];
                }));
                return resolve(consumer);
            }
            catch (ex) {
                return reject(err);
            }
        });

    });
};
