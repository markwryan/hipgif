// token middleware

var authentication = require('./authentication');

module.exports = function (addon) {

    var SKIP_QSH_VERIFICATION = true;

    var authenticationHandler = authentication.authenticate(addon, SKIP_QSH_VERIFICATION);

    function isTokenVerificationDisabled() {
        return /no-token-verfication/.test(process.env.AC_OPTS);
    }

    return function (req, res, next) {

        if (isTokenVerificationDisabled()) {
            return next();
        }

        authenticationHandler(req, res, next);
    };
};
