var inspect = require('util').inspect;
var _ = require('lodash');
var colors = require('colors');

var nodeEnv = process.env.NODE_ENV;
var devEnv = nodeEnv == null || nodeEnv === 'development';

var ops = {info: 'grey', warn: 'yellow', error: 'red'};

module.exports = _.object(_.map(_.keys(ops), function (op) {
    return [op, function () {
        var args = [].slice.call(arguments);
        console[op].apply(console, args.map(function (arg) {
            var s = _.isObject(arg) ? inspect(arg, {colors: devEnv}) : new String(arg).toString();
            return devEnv ? s[ops[op]].bold : s;
        }));
    }];
}));
