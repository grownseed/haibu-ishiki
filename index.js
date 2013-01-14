var haibu = require('haibu'),
  flatiron = require('flatiron'),
  semver = require('semver'),
  app = flatiron.app,
  drone = new haibu.drone.Drone(),
  path = require('path'),
  fs = require('fs'),
  http = require('http'),
  spawn = require('child_process').spawn;

app.use(flatiron.plugins.http, {});

//load configuration
app.config.file({file: 'config.json'});

//configuration default values
app.config.defaults({
  host: '127.0.0.1',
  port: '8080',
  'deploy-dir': 'deployment',
  haibu: {
    address: 'dynamic',
    port: 9002,
    env: 'development',
    'advanced-replies': true,
    useraccounts: true,
    coffee: true,
    directories: {
      'node-installs': 'node-installs',
      packages: 'packages',
      apps: 'apps',
      tmp: 'tmp'
    }
  }
});

//create deployment dir if doesn't exist
if (!fs.existsSync(app.config.get('deploy-dir')))
  fs.mkdirSync(app.config.get('deploy-dir'), '0755');

//make haibu paths relative to root of ishiki
Object.keys(app.config.get('haibu:directories')).forEach(function(key) {
  var fullpath = path.join(__dirname, app.config.get('deploy-dir'), app.config.get('haibu:directories:' + key));

  app.config.set('haibu:directories:' + key, fullpath);

  if (!fs.existsSync(fullpath))
    fs.mkdirSync(fullpath, '0755');
});

//set drone packages dir manually
drone.packagesDir = app.config.get('haibu:directories:packages');

//configure haibu
if (app.config.get('haibu'))
  haibu.config.defaults(app.config.get('haibu'));

app.router.path('/', function()
{
  //list all drones
  this.get(function() {
    this.res.writeHead(200, {'Content-Type': 'application/json'});
    this.res.end(JSON.stringify({drones: drone.list()}));
  });

  //list all drones for particular user
  this.get('/:userid', function(userid) {
    //var user_drones = drone.list().filter(function(d){ return d.user == userid; });

    this.res.writeHead(200, {'Content-Type': 'application/json'});
    this.res.end(JSON.stringify({drones: []}));
  });

  //list all running drones
  this.get('/running', function() {
    this.res.writeHead(200, {'Content-Type': 'application/json'});
    this.res.end(JSON.stringify({drones: drone.running()}));
  });

  //show status of particular app/drone for given user
  /*this.get('/:userid/:appid', function(userid, appid)
  {
    this.res.writeHead(200, {'Content-Type': 'application/json'});
    this.res.end(JSON.stringify({status: }));
  });*/

  //deploy app
  this.post('/:userid/:appid/deploy', {stream: true}, function(userid, appid) {
    var res = this.res,
      req = this.req;

    //watching for new packages since deploy returns no info on package...
    var app_dir = null,
      watcher = fs.watch(app.config.get('haibu:directories:packages'), function(action, filename) {
        if (action == 'rename' && filename.indexOf(userid + '-' + appid + '-') === 0)
          app_dir = filename;
      });

    if (drone.apps[appid] != undefined)
      var drone_app = drone.apps[appid].app;

    //clean up app
    drone.clean({user: userid, name: appid}, function() {
      //deploy
      drone.deploy(userid, appid, req, function(err, result) {
        watcher.close();

        if (err) {
          console.log(err);

          if (app_dir) {
            //read package info
            var package_path = path.join(app.config.get('haibu:directories:packages'), app_dir, 'package.json');

            haibu.common.file.readJson(package_path, function (pkg_err, pkg) {
              if (pkg_err) {
                haibu.emit(['error', 'service'], 'error', err);
                return haibu.sendResponse(res, 500, { error: err });
              }

              //check for node version
              if (pkg.engines && pkg.engines.node) {
                var node_versions = fs.readdirSync(app.config.get('haibu:directories:node-installs')),
                  version = semver.maxSatisfying(node_versions, pkg.engines.node);

                if (version) {
                  console.log('we have the right version', version);
                }else{
                  //get available node versions
                  http.get({host: 'nodejs.org', path: '/dist/', port: 80}, function(result) {
                    if (result.statusCode == 200) {
                      data = '';
                      result.on('data', function(chunk){ data += chunk; });
                      result.on('end', function() {
                        //extracting node versions from returned html
                        var regex = /<a href="v(.*?)\/">/gi,
                          match,
                          available_node_versions = [];

                        while (match = regex.exec(data)) {
                          available_node_versions.push(match[1]);
                        }

                        var best_version = semver.maxSatisfying(available_node_versions, pkg.engines.node);

                        if (!best_version) {
                          return haibu.sendResponse(res, 500, { error: {message: 'Ishiki could not find a matching version of Node for ' + pkg.engines.node} });
                        }else{
                          //install node
                          console.log('Installing Node ' + best_version);

                          var node_dir = path.join(app.config.get('haibu:directories:node-installs'), best_version);

                          spawn('mkdir', [node_dir]).on('exit', function(code) {
                            if (code > 0) {
                              console.log('Cannot create ' + node_dir, code);

                              return haibu.sendResponse(res, 500, { error: {message: 'Failed to create new Node directory'} });
                            }

                            console.log('Downloading Node package')

                            var tmp_file = path.join(app.config.get('haibu:directories:tmp'), 'node-v' + best_version + '.tar.gz');

                            spawn('wget', ['-O', tmp_file, 'http://nodejs.org/dist/v' + best_version + '/node-v' + best_version + '.tar.gz']).on('exit', function(code) {
                              if (code > 0) {
                                console.log('Cannot retrieve node package', code);

                                return haibu.sendResponse(res, 500, { error: {message: 'Failed to download Node package'} });
                              }

                              console.log('Extracting Node package');

                              spawn('tar', ['--strip-components=1', '-xzf', tmp_file, '-C', node_dir]).on('exit', function(code) {
                                if (code > 0) {
                                  console.log('Cannot extract node package', code);

                                  return haibu.sendResponse(res, 500, { error: {message: 'Failed to extract Node package'} });
                                }

                                console.log('Configure Node install');

                                spawn('./configure', ['--prefix=' + node_dir], {cwd: node_dir}).on('exit', function(code) {
                                  if (code > 0) {
                                    console.log('Failed to configure Node install', code);

                                    return haibu.sendResponse(res, 500, { error: {message: 'Failed to configure Node install'} });
                                  }

                                  console.log('Make Node install');

                                  spawn('make', [], {cwd: node_dir}).on('exit', function(code) {
                                    if (code > 0) {
                                      console.log('Failed to make Node install', code);

                                      return haibu.sendResponse(res, 500, { error: {message: 'Failed to make Node install'} });
                                    }

                                    console.log('Install Node');

                                    spawn('make', ['install'], {cwd: node_dir}).on('exit', function(code) {
                                      if (code > 0) {
                                        console.log('Failed to install Node', code);

                                        return haibu.sendResponse(res, 500, { error: {message: 'Failed to install Node'} });
                                      }

                                      console.log('Successfully installed Node ' + best_version);
                                    });
                                  });
                                });
                              });
                            });
                          });
                        }
                      });
                    }
                  }).on('error', function(error) {
                    return haibu.sendResponse(res, 500, { error: error });
                  });
                }
              }
            });
          }
        }else{
          if (drone_app)
          {
            drone.stop(appid, function() {
              drone.start(drone_app, console.log);
            });
          }

          haibu.sendResponse(res, 200, { drone: result });
        }
      });
    });
  });
});

//start ishiki
app.start(app.config.get('port'), app.config.get('host'), function() {
  console.log('Haibu Ishiki started on ' + app.config.get('host') + ':' + app.config.get('port'));
});
