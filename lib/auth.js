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

var crypto = require('crypto'),
  bcrypt = require('bcrypt'),
  userModel = require('../models/user');

var Auth = exports.Auth = function(app, haibu) {
  var self = this,
    admin_username = app.config.get('auth:admin');

  this.app = app;
  this.haibu = haibu;

  //make sure default admin user is created
  userModel.get({username: admin_username}, function(err, users) {
    if (users.length == 0) {
      self.addUser({username: admin_username, admin: true}, function(err, user) {
        if (err)
          return console.log(err);

        console.log('Initial admin account created:\n> username: ' + user.username + '\n> password: ' + user.password);
      });
    }
  });

  //users api
  app.router.path('/users', function() {
    //return all users
    this.get(function() {
      var route = this;

      userModel.get(function(err, users) {
        if (err)
          return haibu.sendResponse(route.res, 500, err);

        haibu.sendResponse(route.res, 200, users);
      });
    });

    //new user
    this.post(function() {
      var route = this,
        err = null;

      if (route.req.body) {
        if (!route.req.body.username || (route.req.body.username && !route.req.body.username.trim()))
          err = 'A username is required';
      }else{
        err = 'New user details missing';
      }

      if (err)
        return haibu.sendResponse(route.res, 500, {message: err});

      self.addUser(route.req.body, function(err, user) {
        if (err)
          return haibu.sendResponse(route.res, 500, err);

        haibu.sendResponse(route.res, 200, user);
      });
    });

    //login
    this.post('/login', function() {
      var route = this;

      self.login(route.req.body, function(err, token) {
        if (err)
          return haibu.sendResponse(route.res, 500, err);

        haibu.sendResponse(route.res, 200, {token: token});
      });
    });

    //logout
    this.post('/logout', function() {
      var route = this;

      userModel.edit(route.req.user._id.toString(), {$set: {token: false, last_access: false}}, function(err, result) {
        if (err)
          return haibu.sendResponse(route.res, 500, err);

        haibu.sendResponse(route.res, 200, {message: 'You are no longer authenticated'});
      });
    });

    //update user
    this.post('/:userid', function(userid) {
      var route = this,
        user;

      function updateUser() {
        userModel.get({username: userid}, function(err, users) {
          if (err)
            return haibu.sendResponse(route.res, 500, err);

          if (users.length == 0)
            return haibu.sendResponse(route.res, 404, {message: 'User does not exist'});

          userModel.edit(users[0]._id.toString(), {$set: user}, function(err, result) {
            if (err)
              return haibu.sendResponse(route.res, 500, err);

            var update_keys = Object.keys(user),
              msg = update_keys.length > 0 ? 'Updated ' + update_keys.join(', ') : 'Nothing to update';

            haibu.sendResponse(route.res, 200, {message: msg});
          });
        });
      }

      //only allow self to update password if not admin
      if (!route.req.user.admin)
        user = {password: route.req.body.password};
      else
        user = route.req.body;

      //don't unset admin
      if (!(user.admin && typeof user.admin === 'boolean'))
        delete user.admin;

      //don't allow username change
      delete user.username;

      if (!user.password || (user.password && !user.password.trim())) {
        delete user.password;

        updateUser();
      }else{
        user.password = self._encryptPassword(user.password, function(err, hash) {
          if (err)
            return haibu.sendResponse(route.res, 500, err);

          user.password = hash;

          updateUser();
        });
      }
    });
  });
};

//check permissions
Auth.prototype.check = function(req, res, next) {
  var self = this,
    url = req.url.split('?'),
    route = url[0].split('/'),
    params = (url[1] && url[1].trim() ? url[1].split('&') : []),
    parsed_params = {};

  //parse params
  if (params.length > 0) {
    for (var i = 0, n = params.length; i < n; i++) {
      var param = params[i].split('=');

      parsed_params[decodeURIComponent(param[0])] = decodeURIComponent(param[1]);
    }
  }

  function errorMsg(err, status, expired) {
    if (expired)
      return self.haibu.sendResponse(res, 401, {message: 'Your authentication token has expired'});

    self.haibu.sendResponse(res, status, err);
  }

  function respond(err, user) {
    if (err)
      errorMsg(err, 500);

    var now = new Date(),
      token_expiry = self.app.config.get('auth:token_expiry'),
      expired = false;

    if (user) {
      //check for outdated token
      if (!user.last_access || (user.last_access && token_expiry)) {
        if (!user.last_access || (now.getTime() - user.last_access.getTime()) / 1000 > token_expiry) {
          expired = true;
        }else{
          //update token expiry
          userModel.edit(user._id.toString(), {$set: {last_access: now}}, function(){});

          //assign user to request
          req.user = user;
        }
      }

      //if admin, no need to check further
      if (user.admin && !expired)
        return next();
    }

    //0: go ahead, 1: require auth, 2: require admin
    var require_auth = 0;

    if (route.length > 1) {
      switch (route[1]) {
        case 'drones':
        case 'users':
          if (user) {
            if (!route[2] ||
              (route[2] && route[2] != user.username.toString() && route[2] != 'logout'))
              require_auth = 2;
          }else{
            require_auth = 1;
          }
          break;
        //proxy stuff admin only
        case 'proxies':
          require_auth = 2;
          break;
      }

      if (!require_auth) {
        return next();
      }else{
        if (require_auth == 1)
          errorMsg({message: 'You need to be authenticated to access this resource'}, 401, expired);
        else
          errorMsg({message: 'You are not authorized to access this resource'}, 403, expired);
      }
    }else{
      return next();
    }
  }

  //only check if route needs to be checked
  if ((route.length > 1 && ['drones', 'users', 'proxies'].indexOf(route[1]) == -1) ||
    req.url == '/users/login')
    return next();

  //look for active token
  if (parsed_params.token) {
    userModel.get({token: parsed_params.token}, function(err, users) {
      if (err)
        return respond(err);

      if (users.length == 1)
        return respond(null, users[0]);

      respond();
    });
  }else{
    respond();
  }
};

//generate a random string
Auth.prototype._randomString = function(n, callback) {
  if (!callback) {
    callback = n;
    n = 8;
  }

  crypto.randomBytes(n, function(ex, buf) {
    callback(buf.toString('hex'));
  });
};

//encrypt password
Auth.prototype._encryptPassword = function(password, callback) {
  bcrypt.genSalt(10, function(err, salt) {
    if (err)
      return callback(err);

    bcrypt.hash(password, salt, callback);
  });
};

//log user in and generate new token
Auth.prototype.login = function(user, callback) {
  var self = this;

  if (!user || !user.username || !user.password)
    return callback({message: 'Please provide a username and a password'});

  //find user
  userModel.get({username: user.username}, function(err, users) {
    if (err)
      return callback(err);

    //generic message to avoid figuring out usernames
    var user_err = {message: 'Username/Password could not be matched'};

    if (users.length == 0)
      return callback(user_err);

    //compare passwords
    bcrypt.compare(user.password, users[0].password, function(err, match) {
      if (err || !match)
        return callback(user_err);

      //save and return token
      self._randomString(32, function(token) {
        userModel.edit(users[0]._id.toString(), {$set: {token: token, last_access: new Date()}}, function(err, result) {
          if (err)
            return callback(user_err);

          callback(null, token);
        });
      });
    });
  });
};

//create a new user
Auth.prototype.addUser = function(user, callback) {
  var self = this;

  if (!user.username)
    return callback({message: 'You need to specify a username'});

  //default to non-admin
  if (!user.admin)
    user.admin = false;

  //check username doesn't already exist and add it if not
  function createUser(user) {
    userModel.get({username: user.username}, function(err, users) {
      if (err)
        return callback(err);

      if (users.length > 0)
        return callback({message: 'Username is already taken'});

      self._encryptPassword(user.password, function(err, password) {
        if (err)
          return callback(err);

        var clear_password = user.password;
        user.password = password;

        userModel.add(user, function(err, result) {
          if (err)
            return callback(err);

          user.password = clear_password;

          callback(null, user);
        });
      });
    });
  }

  //generate password if not provided
  if (!user.password) {
    this._randomString(function(pw) {
      user.password = pw;
      createUser(user);
    });
  }else{
    createUser(user);
  }
};