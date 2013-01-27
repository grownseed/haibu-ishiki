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

  //saves state of drone
  function switchState(started, pkg) {
    pkg.started = started;

    logInfo('info', 'Application ' + (started ? 'started' : 'stopped'), {name: pkg.app, user: pkg.user});
    droneModel.createOrUpdate(pkg, function(){});
  }

  haibu.on('drone:stdout', logInfo);
  haibu.on('drone:stderr', logInfo);
  haibu.on('drone:start', function(type, msg){ switchState(true, msg.pkg) });
  haibu.on('drone:stop', function(type, msg){ switchState(false, msg.pkg) });

  //returns available port within provided range
  var port = app.config.get('port-range:min');

  function getPort ()
  {
    if (port < app.config.get('port-range:max'))
      return port++;
    else
      return false;
  }

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

        //clear old routes
        proxy.deleteBy({user: userid, name: appid});

        pkg.host = result.host;
        pkg.port = result.port;

        //async update package in db
        droneModel.createOrUpdate(pkg, function(){});

        //load new routes
        proxy.load(app.config.get('public-port'), pkg);

        callback(null, {drone: result});
      });
    }else{
      callback({message: 'No more ports available'});
    }
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
          return console.log('Error starting ' + result.user + '/' + result.name + ' ' + (err.message || ''));

        console.log('Started ' + result.user + '/' + result.name);
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
      //
    });

    //stop drone
    this.post('/:userid/:appid/stop', function(userid, appid) {
      //
    });

    //restart drone
    this.post('/:userid/:appid/restart', function(userid, appid) {
      //
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
  });
};