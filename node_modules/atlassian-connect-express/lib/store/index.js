var registry = {};

// Expects opts to be of the following form:
// {
//   'adapter': 'jugglingdb' // default
//   // the jugglingdb adapter can accept a 'type' to specify it's backend
//   'type': 'memory', // default; see https://github.com/1602/jugglingdb for more
//   // additional adapter-specific options, if any
//   ...
// }
var stores = function (logger, opts) {
  return stores.create(opts.adapter || 'jugglingdb', logger, opts);
};

stores.create = function (adapter, logger, opts) {
  var factory = registry[adapter];
  if (!factory) throw new Error('Unregistered adapter value \'' + adapter + '\'');
  return factory(logger, opts);
};

stores.register = function (adapter, factory) {
  registry[adapter] = factory;
};

stores.register('jugglingdb', require('./jugglingdb'));

module.exports = stores;
