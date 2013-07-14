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

var fs = require('fs'),
  path = require('path'),
  semver = require('semver'),
  http = require('http'),
  cp = require('child_process'),
  spawn = cp.spawn,
  exec = cp.exec;

var Nodev = exports.Nodev = function(options) {
  options = options || {};

  this.install_dir = options.install_dir || __dirname;
  this.tmp_dir = options.tmp_dir || __dirname + 'tmp';
};

//list installed versions of Node
Nodev.prototype.getInstalled = function(callback) {
  fs.readdir(this.install_dir, function(err, files) {
    if (err)
      return callback({message: 'Error listing installed Node versions', error: err});

    return callback(null, files);
  });
};

//check whether specific version of Node is installed
Nodev.prototype.isInstalled = function(version, callback) {
  this.getInstalled(function(err, node_versions) {
    if (err)
      return callback(err);

    var best_version = semver.maxSatisfying(node_versions, version);

    if (!best_version)
      return callback({message: 'Node ' + version + ' is not installed'});

    return callback(null, best_version);
  });
};

//retrieve downloadable versions of Node
Nodev.prototype.getAvailable = function(callback) {
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

        return callback(null, available_node_versions);
      });
    }else{
      return callback({message: 'Could not connect to nodejs.org'});
    }
  });
};

//check whether specific version of Node is downloadable
Nodev.prototype.isAvailable = function(version, callback) {
  this.getAvailable(function(err, node_versions) {
    if (err)
      return callback(err);

    var best_version = semver.maxSatisfying(node_versions, version);

    if (!best_version)
      return callback({message: 'No matching version available for ' + version});

    return callback(null, best_version);
  });
};

//create Node version directory
Nodev.prototype.mkdir = function(version, callback) {
  var dir = path.join(this.install_dir, version);

  spawn('mkdir', [dir]).on('exit', function(code) {
    if (code > 0)
      return callback({message: 'Could not create directory', path: dir, code: code});

    return callback(null);
  });
};

Nodev.prototype.findTarball = function(version, callback) {
  exec("uname -a", function(error, stdout, stderr) { 
    if(error)
      return callback({message: 'Error finding tarball (' + error.message + ')', code: error.code});

    var url = "http://nodejs.org/dist/v" + version + "/node-v" + version + ".tar.gz",
      needs_install = true;

    var uname = stdout,
      arch = 'x86',
      os;

    if(uname.indexOf('Linux') == 0) os = 'linux';
    if(uname.indexOf('Darwin') == 0) os = 'darwin';
    if(uname.indexOf('SunOS') == 0) os = 'sunos';

    if(uname.indexOf('x86_64') >= 0) arch = 'x64';
    if(uname.indexOf('armv6l') >= 0) arch = 'arm-pi';

    if(version && arch && os) {
      url = "http://nodejs.org/dist/v" + version + "/node-v" + version + "-" + os + "-" + arch + ".tar.gz";
      needs_install = false;
    }

    return callback(null, url, needs_install);
  });
};

//download package for specific Node version
Nodev.prototype.downloadPackage = function(tarball, version, needs_install, callback) {
  var tmp_file = path.join(this.tmp_dir, 'node-v' + version + '.tar.gz');

  spawn('wget', ['-O', tmp_file, tarball]).on('exit', function(code) {
    if (code > 0)
      return callback({message: 'Error downloading ' + tarball, code: code});

    return callback(null, tmp_file);
  });
};

//extract Node package
Nodev.prototype.extractPackage = function(file, destination, callback) {
  spawn('tar', ['--strip-components=1', '-xzf', file, '-C', destination]).on('exit', function(code) {
    if (code > 0)
      return callback({message: 'Failed to extract Node package', code: code});

    return callback(null);
  });
};

//configure Node build
Nodev.prototype.configure = function(node_dir, callback) {
  spawn('./configure', ['--prefix=' + node_dir], {cwd: node_dir}).on('exit', function(code) {
    if (code)
      return callback({message: 'Failed to configure Node build', code: code});

    return callback(null);
  });
};

//make Node build
Nodev.prototype.make = function(node_dir, callback) {
  spawn('make', [], {cwd: node_dir}).on('exit', function(code) {
    if (code > 0)
      return callback({message: 'Failed to make Node build', code: 0});

    return callback(null);
  });
};

//install Node build
Nodev.prototype.install = function(node_dir, callback) {
  spawn('make', ['install'], {cwd: node_dir}).on('exit', function(code) {
    if (code > 0)
      return callback({message: 'Failed to install Node build', code: code});

    return callback(null);
  });
};

//mashup helper function to carry out all of the above (if required)
Nodev.prototype.checkInstall = function(version, callback) {
  var self = this;

  console.log('Nodev:', 'finding install for Node ' + version);
  self.isInstalled(version, function(err, version_match) {
    if (version_match)
      return callback(null, version_match);

    console.log('Nodev:', 'no install of Node ' + version + ', checking online');
    self.isAvailable(version, function(err, version_match) {
      if (err)
        return callback(err);

      console.log('Nodev:', 'Node ' + version_match + ' available, creating local directory');
      self.mkdir(version_match, function(err) {
        if (err)
          return callback(err);

        console.log('Nodev:', 'finding tarball for Node ' + version_match);
        self.findTarball(version_match, function(err, tarball, needs_install) {
          if (err)
            return callback(err);

          console.log('Nodev:', 'downloading package for Node ' + version_match);
          self.downloadPackage(tarball, version_match, needs_install, function(err, download_path) {
            if (err)
              return callback(err);

            var destination = path.join(self.install_dir, version_match);

            console.log('Nodev:', 'extracting to ' + destination);
            self.extractPackage(download_path, destination, function(err, extract_path) {
              if (err)
                return callback(err);

              if(!needs_install) {
                console.log('Nodev:', 'Node ' + version_match + ' was successfully installed');
                callback(null, version_match);
              } else {
                console.log('Nodev:', 'configuring ' + destination);
                self.configure(destination, function(err) {
                  if (err)
                    return callback(err);

                  console.log('Nodev:', 'making ' + destination);
                  self.make(destination, function(err) {
                    if (err)
                      return callback(err);

                    console.log('Nodev:', 'installing ' + destination);
                    self.install(destination, function(err) {
                      if (err)
                        return callback(err);

                      console.log('Nodev:', 'Node ' + version_match + ' was successfully installed');
                      callback(null, version_match);
                    });
                  });
                });
              }
            });
          });
        });
      });
    });
  });
};
