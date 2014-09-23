var _ = require('lodash');
var fs = require('fs');
var uglify = require('uglify-js');

var utils = {};

utils.unescapelf = function unescapelf(str) {
    return str ? str.replace(/\\n/g, '\n') : str;
}

utils.replaceAll = function replaceAll(settings, values) {
    Object.keys(settings).forEach(function (k) {
        var setting = settings[k];
        if (_.isString(setting)) {
            settings[k] = utils.replaceStr(setting, values);
        } else if (_.isObject(setting)) {
            utils.replaceAll(setting, values);
        }
    });
    return settings;
}

utils.replaceStr = function replaceStr(setting, values) {
    return setting.replace(/\$([a-zA-Z]\w*)/g, function ($0, $1) {
        return values[$1] || $0;
    });
}

utils.loadFile = function loadFile(path) {
    return fs.existsSync(path) ? fs.readFileSync(path).toString() : null;
}

utils.loadJSON = function loadConfig(path) {
    var data = {};
    try {
        data = utils.loadFile(path);
    } catch (e) {}
    return data ? JSON.parse(uglify.minify('t=' + data, {fromString: true, output: {'quote_keys': true}, compress: {booleans: false}}).code.slice(2).replace(/;$/g, '')) : {};
}

utils.replaceTokensInJson = function (obj, from, to) {
    for (var i in obj) {
        if (typeof obj[i] === 'object') {
            obj[i] = utils.replaceTokensInJson(obj[i], from, to);
        } else {
            var re = new RegExp(from);
            if (re.test(obj[i])) {
                obj[i] = obj[i].replace(from, to);
            }
        }
    }
    return obj;
};

module.exports = utils;
