var _ = require('lodash');
var RSVP = require('rsvp');
var Schema = require('jugglingdb').Schema;
var errmsg = require('../internal/errors').errmsg;

// This Allows easy extension of jugglingdb schemas. It works
// like schema.define, but instead of returning a model ctor,
// it returns a promise of a model ctor.  Under the covers,
// it calls schema.define(), and then ensures that all models
// defined via extend are sync'd with the jugglingdb backend.
// When sync'd, it then resolves the returned promise with the
// prepared model ctor.
Schema.prototype.extend = function (name, properties, settings) {
  var Model = this.define(name, properties, settings);
  var promise = new RSVP.Promise(function(presolve,preject) {
    function resolve() { presolve(Model); }
    function reject(err) { preject(err, Model); }
    Model.schema.isActual(function (err, actual) {
      if (err) return reject(err);
      if (!actual) Model.schema.autoupdate(resolve);
      else resolve();
    });

  });
  return promise;
};

function JugglingDB(logger, opts) {
  opts = opts || {};
  var self = this;
  self._data = {};
  self.promise = new RSVP.Promise(function(resolve,reject) {
    var type = opts.type || 'memory';
    var schema = self.schema = new Schema(type, opts);
    schema.extend('AddonSettings', {
      clientKey:    { type: String, index: true },
      key:          { type: String, index: true },
      val:          Schema.JSON
    }).then(
      function (AddonSettings) {
        return new RSVP.Promise(function(resolve) {
          AddonSettings.schema.autoupdate(function() {
            resolve(AddonSettings);
          });
        });
      })
      .then(function(AddonSettings) {
        self._AddonSettings = AddonSettings;
        logger.info('Initialized ' + type + ' storage adapter');
        resolve();
      },
      function (err) {
        logger.error('Failed to initialize ' + type + ' storage adapter: ' + errmsg(err));
        reject(err);
      }
    );
  });
  _.bindAll(self, 'get', 'set', 'del');
}

var proto = JugglingDB.prototype;

proto.isMemoryStore = function() {
  var settings = this.schema.settings;
  return settings.adapter === "jugglingdb" && settings.type === "memory";
};

proto.get = function (key, clientKey) {
  var self = this;
  var promise = new RSVP.Promise(function(resolve,reject) {
    self.promise.then(function(){
      self._AddonSettings.all({where:{key: key, clientKey: clientKey}}, function(err, arry){
        if (err) return reject(err);
        if (arry.length === 0) return resolve(null);
        resolve(arry[0].val);
      });
    });
  });
  return promise;
};

proto.set = function (key, val, clientKey) {
  var self = this;
  var promise = new RSVP.Promise(function(resolve,reject) {
    function fail(err){ reject(err); }
    // the multi db hit here sucks, but juggling seems to be limited
    // to upserting only given serial ids, not arbitrary fields
    self.promise.then(function(){
      self.del(key, clientKey).then(
        function(){
          self._AddonSettings.create({
            clientKey: clientKey,
            key: key,
            val: val
          }, function(err, model){
            if (err) return fail(err);
            resolve(model.val);
          });
        },
        fail
      );
    });
  });
  return promise;
};

proto.del = function (key, clientKey) {
  var whereClause;
  if(arguments.length<2){
    whereClause = {clientKey: key};
  } else {
    whereClause = {key: key, clientKey: clientKey};
  }
  var self = this;
  var promise = new RSVP.Promise(function(resolve,reject) {
    self.promise.then(function(){
      // there should only ever be one, but we'll delete all results to be sure
      self._AddonSettings.all({where: whereClause}, function(err, models){
        RSVP.all(models.map(function(model){
            var subpromise = new RSVP.Promise(function(resolve,reject) {
              model.destroy(function(err){
                if (err) return reject(err);
                resolve();
              });
            });
            return subpromise;
          })).then(
          function () { resolve(); },
          function (err) { reject(err); }
        );
      });
    });
  });
  return promise;
};

module.exports = function (logger, opts) {
  if (0 == arguments.length) {
      return JugglingDB;
  }
  return new JugglingDB(logger, opts);
};


