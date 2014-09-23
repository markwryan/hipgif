var _ = require('lodash');
var crypto = require('crypto');
var os = require('os');
var utils = require('./utils');

var env = process.env;

module.exports = function (mode, overrides) {
    var config = utils.loadJSON('config.json');

    var publicKey = utils.loadFile('public-key.pem');
    var privateKey = utils.loadFile('private-key.pem');

    config = _.extend(config, overrides);
    var globalValues = utils.replaceAll(config, env);
    var modeValues = utils.replaceAll(config[mode] || config['development'], env);

    function get(values, key, envKey, vars) {
        var value = env[envKey] || values[key] || defaults[key];
        if (vars && _.isString(value)) {
            value = utils.replaceStr(value, vars);
        }
        return value;
    }

    function wrap(values) {
        return _.object(Object.keys(values).map(function (k) {
            return [k, function () {
                return values[k];
            }];
        }));
    }

    return _.extend({}, wrap(globalValues), wrap(modeValues), {

        // override simple accessors with more intelligent ones, and add others

        usePublicKey: function () {
            return modeValues['usePublicKey'] === false ? false : defaults['usePublicKey'];
        },

        validatePublicKey: function () {
            if (env['AC_VALIDATE_PUBLIC_KEY'] === "false"
                || modeValues['validatePublicKey'] === false) {
              return false;
            }
            return defaults['validatePublicKey'];
        },

        expressErrorHandling: function() {
            return modeValues['expressErrorHandling'] === true ? true : defaults['expressErrorHandling'];
        },

        watch: function () {
            return modeValues['watch'] === false ? false : defaults['watch'];
        },

        port: function () {
            return get(modeValues, 'port', 'PORT');
        },

        localBaseUrl: function () {
            return get(modeValues, 'localBaseUrl', 'AC_LOCAL_BASE_URL', {port: this.port()});
        },

        store: function () {
            return modeValues['store'] || defaults['store'];
        },

        hosts: function () {
            return get(modeValues, 'hosts');
        },

        jwt: function () {
            return get(modeValues, 'jwt');
        },

        // Returns the maximum age of a token in milliseconds.
        // The configuration value represents seconds.
        maxTokenAge: function () {
            return get(modeValues, 'maxTokenAge') * 1000;
        },

        publicKey: function () {
            if (this.usePublicKey()) {
                return utils.unescapelf(get(modeValues, null, 'AC_PUBLIC_KEY') || publicKey);
            }
            return null;
        },

        privateKey: function () {
            if (this.usePublicKey()) {
                return utils.unescapelf(get(modeValues, null, 'AC_PRIVATE_KEY') || privateKey);
            }
            return null;
        },

        // TODO: Remove once ACE 1.0 and updated template are both released
        secret: function () {
            var salt;
            if (this.usePublicKey()) {
                salt = this.privateKey();
            } else {
                salt = modeValues['salt'] || defaults['salt'];
            }
            return crypto.createHash('sha1').update(salt).digest('base64');
        },

        whitelist: function () {
            var list = get(modeValues, 'whitelist', 'AC_HOST_WHITELIST');
            if (!list) {
                list = mode === 'production' ? '*.jira.com' : '';
            }
            if (_.isString(list)) {
                list = list.split(',').map(function(glob) {
                    return glob.trim();
                });
            }
            return list;
        },

        whitelistRegexp: function () {
            return this.whitelist().map(function (glob) {
                return glob !== '' ? new RegExp('^' + glob.replace(/\./g, '\\.').replace(/\*/g, '[^.]*') + '$') : new RegExp('.*');
            });
        }

    });

};

var defaults = {
    usePublicKey: false,
    validatePublicKey: true,
    expressErrorHandling: false,
    watch: true,
    port: 3000,
    localBaseUrl: 'http://' + os.hostname() + ':$port',
    store: {
        adapter: 'jugglingdb',
        type: 'memory'
    },
    jwt: {
        validityInMinutes: 3
    },
    hosts: [],
    maxTokenAge: 15 * 60,
    salt: "kjs7sa98hsv766476sjd5323-=9podiusd67s45d"
};
