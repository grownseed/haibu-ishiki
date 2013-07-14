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
  nodev = require('./nodev'),
  droneModel = require('../models/drone'),
  logModel = require('../models/log');

module.exports = function(app, haibu, path, fs, drone, proxy) {
  //user/app logs
  function logInfo(type, msg, meta) {
    if (msg.trim() != '' && meta && meta.app && meta.user) {
      var data = {
        type: type,
        msg: msg,
        user: meta.user,
        app: meta.app,
        ts: new Date()
      };

      logModel.add(data, function(){});
    }
  }

  //update drone state
  function switchState(started, pkg) {
    pkg.started = started;

    //add available port back into port range
    if (!started && pkg.env && pkg.env.PORT)
      ports.push(pkg.env.PORT);

    console.log((started ? 'Started' : 'Stopped') + ' application ' + pkg.user + '/' + pkg.name);

    logInfo('info', 'Application ' + (started ? 'started' : 'stopped'), {name: pkg.app, user: pkg.user});
    droneModel.createOrUpdate(pkg, function(){});
  }

  //update drone state and clear proxy routes
  function switchAndClear(pkg) {
    switchState(false, pkg);

    //unload proxy routes
    proxy.deleteBy(app.config.get('public-port'), {user: pkg.user, appid: pkg.name});
  }

  //find drone by uid, update drone state and clear proxy routes
  function findSwitchAndClear(uid) {
    if (uid) {
      droneModel.getProcessed({uid: uid}, function(err, result) {
        if (!err && result && result.length == 1) {
          switchAndClear(result[0]);
        }
      });
    }
  }

  //listen to drones
  haibu.on('drone:stdout', logInfo);
  haibu.on('drone:stderr', logInfo);
  haibu.on('drone:start', function(type, msg) {
    switchState(true, msg.pkg);
  });
  haibu.on('drone:stop', function(type, msg) {
    switchAndClear(msg.pkg);
  });
  haibu.on('drone:stop:error', function(result) {
    findSwitchAndClear(result.key);
  });
  haibu.on('drone:stop:success', function(result) {
    findSwitchAndClear(result.key);
  });

  //generate port range
  var ports = [];

  for (var i = app.config.get('port-range:min'); i <= app.config.get('port-range:max'); i++)
    ports.push(i);

  //returns available port within provided range
  function getPort()
  {
    if (port = ports.shift())
      return port;
    else
      return false;
  }

  //for GET requests, use options from both req.body and req.query
  function merge_options(req){
    var merged = {};
    if(req.body) {
      for (var attrname in req.body) { merged[attrname] = req.body[attrname]; }
    }
    if(req.query) {
      for (var attrname in req.query) { merged[attrname] = req.query[attrname]; }
    }
    return merged;
  }

  //starts a drone and sets up proxy routes for it
  function startDrone(pkg, userid, appid, callback) {
    var drone_port = getPort();

    if (drone_port) {
      pkg.env = pkg.env || {};
      pkg.env['PORT'] = drone_port;

      //ensure package user and name match internally
      pkg.user = userid;
      pkg.name = appid;

      drone.start(pkg, function(err, result) {
        if (err)
          callback(err);

        pkg.host = result.host;
        pkg.port = result.port;
        pkg.uid = result.uid;

        //async update package in db
        droneModel.createOrUpdate(pkg, function(){});

        //load proxy routes
        proxy.load(app.config.get('public-port'), pkg);

        callback(null, {drone: result});
      });
    }else{
      callback({message: 'No more ports available'});
    }
  }

  //stops a drone
  function stopDrone(userid, appid, callback) {
    droneModel.getProcessed({user: userid, name: appid}, function(err, result) {
      if (err)
        return callback(err);

      if (result.length == 1) {
        if (!result[0].started) {
          callback({message: 'Drone is already stopped'});
        }else{
          //need to namespace apps to allow for two users with same app name
          drone.stop(appid, function(err, response) {
            if (err)
              return callback(err);

            result[0].started = false;
            callback(null, result[0]);
          });
        }
      }else{
        callback({message: 'No drone matching ' + userid + '/' + appid});
      }
    });
  }

  //find drones for given filter and sends response
  function sendDrones(filter, res) {
    droneModel.getProcessed(filter, function(err, result) {
      if (err)
        return haibu.sendResponse(res, 500, err);

      haibu.sendResponse(res, 200, {drones: result});
    });
  }

  //automatically start drones
  droneModel.getProcessed({started: true}, function(err, results) {
    results.forEach(function(result) {
      startDrone(result, result.user, result.name, function(err, drone) {
        if (err)
          console.log('Error starting ' + result.user + '/' + result.name, (err.message || err));
      })
    });
  });

  //drones API
  app.router.path('/drones', function() {
    //list all drones
    this.get(function() {
      sendDrones({}, this.res);
    });

    //list all drones for particular user
    this.get('/:userid', function(userid) {
      sendDrones({user: userid}, this.res);
    });

    //list all running drones
    this.get('/running', function() {
      sendDrones({started: true}, this.res);
    });

    //show status of particular app/drone for given user
    this.get('/:userid/:appid', function(userid, appid) {
      sendDrones({user: userid, name: appid}, this.res);
    });

    //start drone
    this.post('/:userid/:appid/start', function(userid, appid) {
      var self = this;

      droneModel.getProcessed({user: userid, name: appid}, function(err, result) {
        if (err)
          return haibu.sendResponse(self.res, 500, err);

        if (result.length == 1) {
          if (result[0].started)
            return haibu.sendResponse(self.res, 500, {message: 'Drone is already started'});
          else
            startDrone(result[0], result[0].user, result[0].name, function(err, response) {
              if (err)
                return haibu.sendResponse(self.res, 500, err);

              result[0].started = true;
              haibu.sendResponse(self.res, 200, result[0]);
            });
        }else{
          haibu.sendResponse(self.res, 500, {message: 'No drone matching ' + userid + '/' + appid});
        }
      });
    });

    //stop drone
    this.post('/:userid/:appid/stop', function(userid, appid) {
      var self = this;

      stopDrone(userid, appid, function(err, result) {
        if (err)
          return haibu.sendResponse(self.res, 500, err);

        haibu.sendResponse(self.res, 200, result);
      });
    });

    //restart drone
    this.post('/:userid/:appid/restart', function(userid, appid) {
      var self = this;

      stopDrone(userid, appid, function(err, result) {
        if (err)
          return haibu.sendResponse(self.res, 500, err);

        startDrone(result, userid, appid, function(err, result) {
          if (err)
            return haibu.sendResponse(self.res, 500, err);

          haibu.sendResponse(self.res, 200, result);
        });
      });
    });

    //deploy app
    this.post('/:userid/:appid/deploy', {stream: true}, function(userid, appid) {
      var res = this.res,
        req = this.req;

      //clean up app
      drone.clean({user: userid, name: appid}, function() {
        //deploy
        drone.deployOnly(userid, appid, req, function(err, pkg) {
          if (err) {
            haibu.sendResponse(res, 500, err);
          }else{
            var pkg_keys = Object.keys(pkg),
              errors = [];

            //validate app package
            if (pkg_keys.length == 0) {
              errors.push('package.json is empty');
            }else{
              //check for app name
              if (!pkg.name || (pkg.name && pkg.name.trim() == ''))
                errors.push('`name` is required');

              //check for start script
              if (!pkg.scripts) {
                errors.push('`scripts` is required');
              }else{
                if (!pkg.scripts.start || (pkg.scripts.start && pkg.scripts.start.trim() == ''))
                  errors.push('`scripts.start` is required');
              }

              //check for engine
              if (!pkg.engines) {
                errors.push('`engines` is required');
              }else{
                if (!pkg.engines.node || (pkg.engines.node && pkg.engines.node.trim() == ''))
                  errors.push('`engines.node` is required');
              }

              //check for domains
              var domains = [],
                in_use = [];
              ['domain', 'domains', 'subdomain', 'subdomains'].forEach(function(key) {
                if (pkg[key]) {
                  if (typeof pkg[key] == 'string')
                    pkg[key] = pkg[key].split(' ');

                  pkg[key].forEach(function(d) {
                    //use proxy to check whether domain is already in use
                    if (d && proxy.proxies[app.config.get('public-port')] &&
                      proxy.proxies[app.config.get('public-port')].routes[d])
                      in_use.push(d);
                    else if (d)
                      domains.push(d);
                  });
                }
              });

              if (domains.length == 0)
                errors.push('at least one of `domain`, `domains`, `subdomain` or `subdomains` is required');

              if (in_use.length > 0)
                errors.push('the following domains are already in use: ' + in_use.join(', '));

              //check env isn't wrongly set
              if (pkg.env) {
                if (typeof pkg.env != 'object')
                  errors.push('if specified, `env` has to be an object');
              }
            }

            //return errors if there are any
            if (errors.length > 0) {
              var message = 'There are issues with your package.json file:\n' + errors.join('\n');

              return haibu.sendResponse(res, 400, {message: message});
            }

            var node_version = new nodev.Nodev({
              install_dir: app.config.get('haibu:directories:node-installs'),
              tmp_dir: app.config.get('haibu:directories:tmp')
            });

            //check for node version
            if (pkg.engines && pkg.engines.node) {
              node_version.checkInstall(pkg.engines.node, function(err, version_match) {
                if (err)
                  return haibu.sendResponse(res, 500, {message: err.message});

                startDrone(pkg, userid, appid, function(err, result) {
                  if (err)
                    return haibu.sendResponse(res, 500, err);

                  haibu.sendResponse(res, 200, result);
                });
              });
            }
          }
        });
      });
    });

    //return logs for given user/app
    this.get('/:userid/:appid/logs', function(userid, appid) {
      var req = this.req,
        res = this.res,
        filter = {},
        options = {limit: 10, sort: {$natural: -1}},
        stream = false,
        merged_options = merge_options(this.req);

      filter.user = userid;
      filter.app = appid;

      if (merged_options.type)
        filter.type = merged_options.type;
      if (merged_options.limit)
        options.limit = merged_options.limit;
      if (merged_options.stream)
        stream = true;

      logModel.get(filter, options, function(err, result) {
        if (!stream) {
          if (err)
            return haibu.sendResponse(res, 500, err);

          haibu.sendResponse(res, 200, result);
        }else{
          res.writeHead(200, {'Content-type': 'plain/text'});

          result.on('data', function(item) {
            var output = '[' + item.ts + '] ';

            output += '[' + item.type + '] ';
            output += item.msg;

            res.write(output);
          });

          //need to find a solution to close stream when req cancelled
        }
      }, stream);
    });
  });
};
