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

var Bson = require('mongodb').BSONPure;

var BaseModel = exports.BaseModel = function(options) {
  options = options || {};

  this.collection = options.collection || '';
};

//retrieve one entry if id passed, or several if {} passed
BaseModel.prototype.get = function(filter, options, callback, stream) {
  if (!callback) {
    callback = options;
    options = {};
  }
  if (!callback) {
    callback = filter;
    filter = {};
  }

  db.collection(this.collection, function(err, collection) {
    if (err) {
      callback(err);
    }else{
      if (typeof filter == 'string')
      {
        collection.findOne({_id: new Bson.ObjectID(filter)}, function(err, data) {
          if (err)
            callback(err);
          else
            callback(null, data);
        });
      }
      else if (typeof filter == 'object') {
        if (!stream) {
          collection.find(filter, {}, options).toArray(function(err, data) {
            if (err)
              callback(err);
            else
              callback(null, data);
          });
        }else{
          var db_stream = collection.find(filter, {}, {tailable: true, timeout: false}).stream();

          callback(null, db_stream);
        }
      }
    }
  });
};

//add entry
BaseModel.prototype.add = function(data, callback) {
  db.collection(this.collection, function(err, collection) {
    if (err) {
      callback(err);
    }else{
      collection.insert(data, function(err, result) {
        if (err)
          callback(err);
        else
          callback(null, result);
      })
    }
  });
};

//update entry
BaseModel.prototype.edit = function(id, data, callback) {
  db.collection(this.collection, function(err, collection) {
    if (err) {
      callback(err);
    }else{
      collection.update({_id: new Bson.ObjectID(id)}, data, {safe: true}, function(err, result) {
        if (err)
          callback(err);
        else
          callback(null, result);
      });
    }
  })
};

//delete entry
BaseModel.prototype.delete = function(id, callback) {
  db.collection(this.collection, function(err, collection) {
    if (err) {
      callback(err);
    }else{
      collection.remove({_id: Bson.ObjectID(id)}, {safe: true}, function(err, result) {
        if (err)
          callback(err);
        else
          callback(null, result);
      });
    }
  });
};