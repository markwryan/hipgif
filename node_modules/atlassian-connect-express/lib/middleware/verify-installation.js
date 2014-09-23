// Handles the lifecycle "installed" event of a connect addon.

var request = require('request');
var urls = require('url');
var _ = require('lodash');
var hostInfo = require('../internal/host-info');

function verifyPublicKey(addon, options) {
    var attempts = 0;

    var tryUntilSuccess = function () {
        attempts++;
        addon.logger.info('[VERIFY] Attempt', attempts, ': Verifying public key for instance', options.hostBaseUrl);
        var hostRequestOptions = {
            "baseUrl": options.hostBaseUrl,
            "timeout": 5000 // ms
        };
        hostInfo.get(hostRequestOptions).then(
            function (data) {
                options.successCallback(data);
            },
            function (err) {
                if (attempts < options.retries) {
                    addon.logger.error('[VERIFY] Attempt', attempts, ': Could not retrieve public key for instance', options.hostBaseUrl, 'to verify public key for instance', options.hostBaseUrl, ' Waiting ' + options.retryInterval + 'ms before retrying.', err);
                    setTimeout(tryUntilSuccess, options.retryInterval);
                } else {
                    addon.logger.error('[VERIFY] Attempt', attempts, ': Could not retrieve public key for instance', options.hostBaseUrl, 'to verify public key for instance', options.hostBaseUrl, err);
                    options.errorCallback(err);
                }
            }
        );
    };
    tryUntilSuccess();
}

function verifyInstallation(addon) {
    return function (req, res, next) {
        function sendError(msg) {
            var code = 401;
            addon.logger.error('Installation verification error:', code, msg);
            if (addon.config.expressErrorHandling()) {
                next({
                    code: code,
                    message: msg
                });
            } else {
                res.send(code, _.escape(msg));
            }
        }

        var regInfo = req.body;
        if (!regInfo || !_.isObject(regInfo)) {
            sendError('No registration info provided.');
            return;
        }

        // verify that the specified host is in the registration whitelist;
        // this can be spoofed, but is a first line of defense against unauthorized registrations
        var baseUrl = regInfo.baseUrl;
        if (!baseUrl) {
            sendError('No baseUrl provided in registration info.');
            return;
        }

        var host = urls.parse(baseUrl).hostname;
        var whitelisted = addon.config.whitelistRegexp().some(function (re) {
            return re.test(host);
        });
        if (!whitelisted) {
            return sendError('Host at ' + baseUrl + ' is not authorized to register as the host does not match the ' +
                'registration whitelist (' + addon.config.whitelist() + ').');
        }

        var clientKey = regInfo.clientKey;
        if (!clientKey) {
            sendError('No client key provided for host at ' + baseUrl + '.');
            return;
        }

        if (!addon.config.validatePublicKey()) {
            addon.logger.warn("Skipped public key validation for host '" + baseUrl + "'");
            return next();
        }

        // next verify with the provided publicKey; this could be spoofed, but we will verify the key
        // in a later step if it checks out
        var publicKey = regInfo.publicKey;
        if (!publicKey) {
            sendError('No public key provided for host at ' + baseUrl + '.');
            return;
        }

        verifyPublicKey(addon, {
            "hostBaseUrl": baseUrl,
            "retries": 3,
            "retryInterval": 2000, // milliseconds to wait between retries
            "successCallback": function (data) {
                if (data.publicKey !== publicKey) {
                    // if the returned key does not match the key specified in the installation request,
                    // we must assume that this is a spoofing attack and reject the installation
                    sendError('The public key for ' + baseUrl + ' (' + data.publicKey + ') did not match the initially provided public key (' + publicKey + ')');
                    return;
                }
                next();
            },
            "errorCallback": function (err) {
                sendError('Unable to verify public key for host ' + baseUrl + ': ' + err);
            }
        })
    }
}

module.exports = verifyInstallation;
