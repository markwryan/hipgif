var httpClient = require('request');
var _ = require('lodash');
var moment = require('moment');
var urls = require('url');
var jwt = require('./jwt');
var Uri = require('jsuri');
var qs = require('qs');

function checkNotNull(thing, name) {
    if (_.isNull(thing)) {
        throw new Error(name + ' must be defined');
    }
}

module.exports = function (addon, context, clientKey) {

    checkNotNull(addon, 'addon');
    checkNotNull(addon.settings, 'addon.settings');
    context = context || {};

    var createJwtPayload = function (req, userKey) {
        var now = moment().utc(),
                jwtTokenValidityInMinutes = addon.config.jwt().validityInMinutes;

        var token = {
            "iss": addon.key,
            "iat": now.unix(),
            "exp": now.add(jwtTokenValidityInMinutes, 'minutes').unix(),
            "qsh": jwt.createQueryStringHash(req),
            "aud": [ clientKey ]
        };

        if (userKey) {
            token["sub"] = userKey;
        }
        return token;
    };

    var hostClient = function (options, callback) {
        return httpClient.apply(null, modifyArgs(options, callback));
    };

    ['get', 'post', 'put', 'del', 'head', 'patch'].forEach(function (method) {
        // hostClient.get -> return function
        // hostClient.get(options, callback) -> get client settings -> augment options -> callback
        hostClient[method] = function (options, callback) {
            return addon.settings.get('clientInfo', clientKey).then(function (clientSettings) {

                if (!clientSettings) {
                    addon.logger.warn('There are no "clientInfo" settings in the store for tenant "' + clientKey + '"');
                    return null;
                }

                var augmentHeaders = function (headers, relativeUri) {
                    var uri = new Uri(relativeUri);
                    var query = qs.parse(uri.uriParts.query);
                    var userKey = null;
                    if (context.userKey) {
                        userKey = context.userKey;
                    } else if (context.userId) {
                        addon.logger.warn("httpRequest userId is deprecated: please use the userKey attribute");
                        userKey = context.userId;
                    }

                    var httpMethod = method === 'del' ? 'delete' : method;

                    var jwtPayload = createJwtPayload({
                                'method': httpMethod,
                                'path'  : uri.path(),
                                'query' : query
                            }, userKey),
                            jwtToken = jwt.encode(jwtPayload, clientSettings.sharedSecret, 'HS256');

                    headers['Authorization'] = "JWT " + jwtToken;
                };

                var args = modifyArgs(options, augmentHeaders, callback, clientSettings.baseUrl);

                var multipartFormData = options.multipartFormData;
                delete options.multipartFormData;

                var request = httpClient[method].apply(null, args);

                if (multipartFormData) {
                    var form = request.form();

                    for (var key in multipartFormData) {
                        var value = multipartFormData[key];
                        if (Array.isArray(value)) {
                            form.append.apply(form, [key].concat(value));
                        }
                        else {
                            form.append.apply(form, [key, value]);
                        }
                    }
                }

                return request;
            });
        };
    });

    hostClient.defaults = function (options) {
        return httpClient.defaults.apply(null, modifyArgs(options));
    };

    hostClient.cookie = function () {
        return httpClient.cookie.apply(null, arguments);
    };

    hostClient.jar = function () {
        return httpClient.jar();
    };

    function modifyArgs(options, augmentHeaders, callback, hostBaseUrl) {
        var args = [];

        if (_.isString(options)) {
            options = {uri: options};
        }
        if (options.url) {
            options.uri = options.url;
            delete options.url;
        }
        if (options.form) {
            options.multipartFormData = options.form;
            delete options.form;
            addon.logger.warn("options.form is deprecated: please use options.multipartFormData");
        }
        if (options.urlEncodedFormData) {
            options.form = options.urlEncodedFormData;
            delete options.urlEncodedFormData;
        }

        var relativeUri = options.uri;
        var urlMod = modifyUrl(options.uri, hostBaseUrl);
        options.uri = urlMod[0];
        var isHostUrl = urlMod[1];
        args.push(options);

        if (isHostUrl) {
            if (!options.headers) {
                options.headers = {};
            }

            if (augmentHeaders) {
                augmentHeaders(options.headers, relativeUri);
            }

            options.jar = false;
            if (callback) {
                args.push(callback);
            }
        }

        return args;
    }

    function modifyUrl(url, hostBaseUrl) {
        var isHostUrl = false;
        var uri = new Uri(url);
        var protocol = uri.protocol();
        if (!protocol) {
            url = urls.format(urls.parse((hostBaseUrl ? hostBaseUrl : '') + url));
            isHostUrl = true;
        }
        return [url, isHostUrl];
    }

    return hostClient;
};
