var crypto = require('crypto'),
  nodev = require('./nodev'),
  droneModel = require('../models/drone'),
  logModel = require('../models/log');

module.exports = function(app, haibu, path, fs, drone, proxy) {
  //listen to drones

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

  haibu.on('drone:stdout', logInfo);
  haibu.on('drone:stderr', logInfo);
  haibu.on('drone:start', function(type, msg) {
    switchState(true, msg.pkg);

    //load proxy routes
    proxy.load(app.config.get('public-port'), msg.pkg);
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
        stream = false;

      options.user = userid;
      options.app = appid;

      if (this.req.body) {
        if (this.req.body.type)
          filter.type = this.req.body.type;
        if (this.req.body.limit)
          options.limit = this.req.body.limit.toInt();
        if (this.req.body.stream)
          stream = true;
      }

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