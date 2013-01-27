#!/usr/bin/env node

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
  'public-port': 80,
  'deploy-dir': path.join(__dirname, 'deployment'),
  'port-range': {
    min: 9080,
    max: 10080
  },
  mongodb: {
    host: '127.0.0.1',
    port: 27017,
    database: 'ishiki'
  },
  haibu: {
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

//instantiate db
var mongo = require('mongodb'),
  Server = mongo.Server,
  Db = mongo.Db,
  Bson = mongo.BSONPure;

var server = new Server(app.config.get('mongodb:host'), app.config.get('mongodb:port'), {auto_reconnect: true});

db = new Db(app.config.get('mongodb:database'), server, {safe: true}, {strict: false});

db.open(function(err, db) {
  var mongo_path = app.config.get('mongodb:host') + ':' + app.config.get('mongodb:port') + '/' + app.config.get('mongodb:database');

  if (!err) {
    console.log('Connected to ' + mongo_path);
  }else{
    console.log('Could not connect to ' + mongo_path);
  }
});

//extend drone
drone.deployOnly = require('./lib/drone.extend');

//create deployment dir if doesn't exist
if (!fs.existsSync(app.config.get('deploy-dir')))
  fs.mkdirSync(app.config.get('deploy-dir'), '0755');

//make haibu paths relative to root of ishiki
Object.keys(app.config.get('haibu:directories')).forEach(function(key) {
  var fullpath = path.join(app.config.get('deploy-dir'), app.config.get('haibu:directories:' + key));

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
