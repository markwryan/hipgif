var moment = require('moment');
var jwt = require('../internal/jwt');
var requestHandler = require('./request');
var _ = require('lodash');

var TOKEN_KEY_PARAM = 'acpt';
var TOKEN_KEY_HEADER = 'X-' + TOKEN_KEY_PARAM;

var JWT_PARAM = 'jwt';
var AUTH_HEADER = 'authorization'; // the header name appears as lower-case

var authentication = {};

authentication.authenticateWebhook = function (addon) {
    var self = this;
    return function (req, res, next) {
        addon.emit('webhook_auth_verification_triggered');

        self.authenticate(addon)(req, res, function () {
            addon.emit('webhook_auth_verification_successful');
            return next();
        });
    }
};

authentication.authenticate = function (addon, skipQshVerification) {

    function extractJwtFromRequest(req) {
        var token = req.query[JWT_PARAM];

        // if there was no token in the query-string then fall back to checking the Authorization header
        var authHeader = req.headers[AUTH_HEADER];
        if (authHeader && authHeader.indexOf('JWT ') == 0) {
            if (token) {
                addon.logger.warn('JWT token found in query and in header: using query value.');
            }
            else {
                token = authHeader.substring(4);
            }
        }

        // TODO: Remove when we discontinue the old token middleware
        if (!token) {
            token = req.query[TOKEN_KEY_PARAM] || req.header(TOKEN_KEY_HEADER);
        }

        return token;
    }

    return function (req, res, next) {

        function sendError(code, msg) {
            addon.logger.error('Authentication verification error:', code, msg);
            if (addon.config.expressErrorHandling()) {
                next({
                    code: code,
                    message: msg
                });
            } else {
                res.send(code, _.escape(msg));
            }
        }

        if (/no-auth/.test(process.env.AC_OPTS)) {
            console.warn('Auth verification is disabled, skipping validation of request.');
            next();
            return;
        }

        var token = extractJwtFromRequest(req);
        if (!token) {
            sendError(401, 'Could not find authentication data on request');
            return;
        }

        try {
            var unverifiedClaims = jwt.decode(token, '', true); // decode without verification;
        } catch (e) {
            sendError(401, 'Invalid JWT: ' + e.message);
            return;
        }

        var issuer = unverifiedClaims.iss;
        if (!issuer) {
            sendError(401, 'JWT claim did not contain the issuer (iss) claim');
            return;
        }

        var queryStringHash = unverifiedClaims.qsh;
        if (!queryStringHash && !skipQshVerification) { // session JWT tokens don't require a qsh
            sendError(401, 'JWT claim did not contain the query string hash (qsh) claim');
            return;
        }

        var request = req;
        var clientKey = issuer;

        // The audience claim identifies the intended recipient, according to the JWT spec,
        // but we still allow the issuer to be used if 'aud' is missing.
        // Session JWTs make use of this (the issuer is the add-on in this case)
        if (!_.isEmpty(unverifiedClaims.aud)) {
            clientKey = unverifiedClaims.aud[0];
        }

        addon.settings.get('clientInfo', clientKey).then(function (settings) {

            function success(verifiedClaims) {
                var token = createSessionToken(verifiedClaims);
                // Invoke the request middleware (again) with the verified and trusted parameters
                requestHandler(addon, {
                    clientKey: clientKey,
                    userId: verifiedClaims.sub,
                    hostBaseUrl: settings.baseUrl,
                    token: token
                })(req, res, next);
            }

            // Create a JWT token that can be used instead of a session cookie
            function createSessionToken(verifiedClaims) {
                var now = moment().utc();
                var token = jwt.encode({
                    'iss': addon.key,
                    'sub': verifiedClaims.sub,
                    'iat': now.unix(),
                    'exp': now.add(addon.config.maxTokenAge(), 'seconds').unix(),
                    'aud': [ clientKey ]
                }, settings.sharedSecret);
                res.setHeader(TOKEN_KEY_HEADER, token);
                return token;
            }

            if (!settings) {
                sendError(401, 'Could not find stored client data for ' + clientKey + '. Is this client registered?');
                return;
            }
            var secret = settings.sharedSecret;
            if (!secret) {
                sendError(401, 'Could not find JWT sharedSecret in stored client data for ' + clientKey);
                return;
            }
            var verifiedClaims;
            try {
                verifiedClaims = jwt.decode(token, secret, false);
            } catch (error) {
                sendError(400, 'Unable to decode JWT token: ' + error);
                return;
            }

            var expiry = verifiedClaims.exp;

            // todo build in leeway?
            if (expiry && moment().utc().unix() >= expiry) {
                sendError(401, 'Authentication request has expired.');
                return;
            }

            // First check query string params
            if (verifiedClaims.qsh) {
                var expectedHash = jwt.createQueryStringHash(request, false, addon.config.baseUrl.href);
                var signatureHashVerified = verifiedClaims.qsh === expectedHash;
                if (!signatureHashVerified) {
                    // Send the error message for the first verification - it's 90% more likely to be the one we want.
                    var error = 'Auth failure: Query hash mismatch: Received: "' + verifiedClaims.qsh + '" but calculated "' + expectedHash + '". ' +
                            'Canonical query was: "' + jwt.createCanonicalRequest(request, addon.config.baseUrl.href);
                    // If that didn't verify, it might be a post/put - check the request body too
                    expectedHash = jwt.createQueryStringHash(request, true);
                    signatureHashVerified = verifiedClaims.qsh === expectedHash;
                    if (!signatureHashVerified) {
                        addon.logger.error(error);
                        sendError(401, 'Authentication failed: query hash does not match.');
                        return;
                    }
                }
            }

            success(verifiedClaims);
        }, function (err) {
            sendError(500, 'Could not lookup stored client data for ' + clientKey + ': ' + err);
        });
    };
};

module.exports = authentication;
