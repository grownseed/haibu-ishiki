var Bson = require('mongodb').BSONPure;

var BaseModel = exports.BaseModel = function(options) {
  options = options || {};

  this.collection = options.collection || '';
};

//retrieve one entry if id passed, or several if {} passed
BaseModel.prototype.get = function(filter, options, callback) {
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
        collection.find(filter, {}, options).toArray(function(err, data) {
          if (err)
            callback(err);
          else
            callback(null, data);
        });
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