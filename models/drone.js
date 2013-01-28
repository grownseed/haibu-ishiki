/*
 The MIT License

 Copyright (c) 2013 Hadrien Jouet https://github.com/grownseed

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */

var BaseModel = require('./_base').BaseModel,
  util = require('util');

//mongodb illegal key chars
var illegal_chars = ['/', '\\', '.', ' ', '"', '*', '<', '>', ':', '|', '?'],
  escape_with = '__';

var DroneModel = function() {
  DroneModel.super_.apply(this, arguments);
};

util.inherits(DroneModel, BaseModel);

//processes mongodb illegal characters in keys
//pre to true preprocesses, otherwise postprocesses
DroneModel.prototype.process = function(data, pre) {
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

DroneModel.prototype.getProcessed = function(filter, callback) {
  var self = this;

  this.get(filter, function(err, result) {
    if (err)
      return callback(err);

    for (var i in result) {
      result[i] = self.process(result[i]);
    }

    callback(null, result);
  });
};

DroneModel.prototype.createOrUpdate = function(pkg, callback) {
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

module.exports = new DroneModel({collection: 'drone'});