#!/usr/bin/env node

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

var haibu = require('haibu'),
  flatiron = require('flatiron'),
  flatiron_options = {},
  app = flatiron.app,
  drone = new haibu.drone.Drone(),
  path = require('path'),
  fs = require('fs');

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
  'logs-size': 100000,
  auth: {
    active: true,
    admin: 'ishiki',
    token_expiry: 1800
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

//check for SSL cert
if (app.config.get('https'))
  flatiron_options.https = app.config.get('https');

app.use(flatiron.plugins.http, flatiron_options);

//instantiate db
var mongo = require('mongodb'),
  Server = mongo.Server,
  Db = mongo.Db;

var server = new Server(app.config.get('mongodb:host'), app.config.get('mongodb:port'), {auto_reconnect: true});

db = new Db(app.config.get('mongodb:database'), server, {safe: true}, {strict: false});

db.open(function(err, db) {
  var mongo_path = app.config.get('mongodb:host') + ':' + app.config.get('mongodb:port') + '/' + app.config.get('mongodb:database');

  if (!err) {
    console.log('Connected to ' + mongo_path);

    //ensure log collection is a capped one
    db.createCollection('log', {capped: true, size: app.config.get('logs-size')}, function(err, response) {});
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

//load persistent proxy routes
proxy.autoload();

//define routes
require('./lib/ishiki')(app, haibu, path, fs, drone, proxy);

if (app.config.get('auth:active')) {
  //authentication
  var auth = require('./lib/auth').Auth,
    user_auth = new auth(app, haibu);

  //check permissions on each request
  app.http.before.push(user_auth.check.bind(user_auth));
}

//start ishiki
app.start(app.config.get('port'), app.config.get('host'), function() {
  console.log('Haibu Ishiki started on ' + app.config.get('host') + ':' + app.config.get('port'));
});
