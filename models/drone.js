var BaseModel = require('./_base').BaseModel,
  util = require('util');

//mongodb illegal key chars
var illegal_chars = ['/', '\\', '.', ' ', '"', '*', '<', '>', ':', '|', '?'],
  escape_with = '__';

//processes mongodb illegal characters in keys
//pre to true preprocesses, otherwise postprocesses
BaseModel.prototype.process = function(data, pre) {
  var self = this;

  Object.keys(data).forEach(function(key) {
    var new_key = key;

    illegal_chars.forEach(function(c, i) {
      var from = pre ? c : escape_with + i + escape_with,
        to = pre ? escape_with + i + escape_with : c;

      if (key.indexOf(from) !== -1) {
        new_key = new_key.split(from).join(to);
      }
    });

    if (new_key != key) {
      data[new_key] = data[key];
      delete data[key];
      key = new_key;
    }

    if (data[key] && typeof data[key] == 'object')
      data[key] = self.process(data[key], pre);
  });

  return data;
};

BaseModel.prototype.createOrUpdate = function(pkg, callback) {
  var self = this;

  if (pkg._id) delete pkg._id;

  this.get({name: pkg.name, user: pkg.user}, function(err, result) {
    if (err)
      return callback(err);

    pkg = self.process(pkg, true);

    if (result.length == 1) {
      self.edit(result[0]._id.toString(), {$set: pkg}, function(err, success) {
        if (err)
          return callback(err);

        callback(null, self.process(pkg, false));
      });
    }else{
      self.add(pkg, function(err, result) {
        if (err)
          return callback(err);

        callback(null, self.process(result[0], false));
      });
    }
  });
};

module.exports = new BaseModel({collection: 'drone'});