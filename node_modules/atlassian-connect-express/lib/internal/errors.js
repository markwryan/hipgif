exports.errmsg = function (err) {
    return err ? err.toString() + (err.stack ? '\n' + err.stack : '') : 'Unknown';
};
