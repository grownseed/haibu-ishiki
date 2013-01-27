var BaseModel = require('./_base').BaseModel,
  util = require('util');

var ProxyModel = function() {
  ProxyModel.super_.apply(this, arguments);
};

util.inherits(ProxyModel, BaseModel);

ProxyModel.prototype.createOrUpdate = function(source, target, callback) {
  var self = this;

  this.get({source: source}, function(err, result) {
    if (err)
      return callback(err);

    if (result.length == 1)
      self.edit(result[0]._id.toString(), {$set: {target: target}}, callback);
    else
      self.add({source: source, target: target}, callback);
  });
};

ProxyModel.prototype.deleteBy = function(filter, callback) {
  var self = this;

  this.get(filter, function(err, result) {
    if (err)
      return callback(err);

    if (result.length > 0) {
      result.forEach(function(route) {
        self.delete(route._id.toString(), function() {});
      });

      callback(null);
    }
  });
};

module.exports = new ProxyModel({collection: 'proxy'});