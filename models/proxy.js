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