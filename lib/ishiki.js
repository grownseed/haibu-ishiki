var crypto = require('crypto'),
  nodev = require('./nodev');

module.exports = function(app, haibu, path, fs, drone, proxy) {
  var port = app.config.get('port-range:min');

  function getPort ()
  {
    if (port < app.config.get('port-range:max'))
      return port++;
    else
      return false;
  }

  app.router.path('/drones', function() {
    //list all drones
    this.get(function() {
      haibu.sendResponse(this.res, 200, {drones: drone.list()});
    });

    //list all drones for particular user
    this.get('/:userid', function(userid) {
      //var user_drones = drone.list().filter(function(d){ return d.user == userid; });

      haibu.sendResponse(this.res, 200, {drones: []});
    });

    //list all running drones
    this.get('/running', function() {
      haibu.sendResponse(this.res, 200, {drones: drone.running()});
    });

    //show status of particular app/drone for given user
    this.get('/:userid/:appid', function(userid, appid) {
      haibu.sendResponse(this.res, 200, {status: null});
    });

    //deploy app
    this.post('/:userid/:appid/deploy', {stream: true}, function(userid, appid) {
      var res = this.res,
        req = this.req;

      function startDrone(pkg) {
        var drone_port = getPort();

        if (drone_port) {
          pkg.env = pkg.env || {};
          pkg.env['PORT'] = drone_port;

          drone.start(pkg, function(err, result) {
            if (err)
              return haibu.sendResponse(res, 500, err);

            //clear old routes
            proxy.deleteBy({user: userid, name: appid});

            pkg.host = result.host;
            pkg.port = result.port;

            //load new routes
            proxy.load(app.config.get('public-port'), pkg);

            haibu.sendResponse(res, 200, { drone: result });
          });
        }else{
          haibu.sendResponse(res, 500, { message: 'No more ports available' });
        }
      }

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

                startDrone(pkg);
              });
            }
          }
        });
      });
    });
  });
};