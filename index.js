var haibu = require('haibu'),
  flatiron = require('flatiron'),
  app = flatiron.app,
  drone = new haibu.drone.Drone(),
  path = require('path'),
  fs = require('fs');

app.use(flatiron.plugins.http, {});

//load configuration
app.config.file({file: 'config.json'});

//configuration default values
app.config.defaults({
  host: '127.0.0.1',
  port: '8080',
  'public-port': 880,
  'deploy-dir': 'deployment',
  'port-range': {
    min: 9080,
    max: 10080
  },
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

//extend drone
drone.deployOnly = require('./lib/drone.extend');

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


//set up proxy
var http_proxy = require('./lib/proxy').Proxy,
  proxy = new http_proxy(app, haibu);

//start default proxy
proxy.start(app.config.get('public-port'));

//define routes
require('./lib/ishiki')(app, haibu, path, fs, drone, proxy);

//start ishiki
app.start(app.config.get('port'), app.config.get('host'), function() {
  console.log('Haibu Ishiki started on ' + app.config.get('host') + ':' + app.config.get('port'));
});
