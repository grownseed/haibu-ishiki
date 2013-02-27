var fs = require('fs'),
  path = require('path'),
  semver = require('semver'),
  http = require('http'),
  spawn = require('child_process').spawn;

var Nodev = exports.Nodev = function(options) {
  options = options || {};

  this.install_dir = options.install_dir || __dirname;
  this.tmp_dir = options.tmp_dir || __dirname + 'tmp';
};

Nodev.prototype.getInstalled = function(callback) {
  fs.readdir(this.install_dir, function(err, files) {
    if (err)
      return callback({message: 'Error listing installed Node versions', error: err});

    return callback(null, files);
  });
};

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

Nodev.prototype.getAvailable = function(callback) {
  http.get({host: 'nodejs.org', path: '/dist/', port: 80}, function(result) {
    if (result.statusCode == 200) {
      data = '';
      result.on('data', function(chunk){ data += chunk; });
      result.on('end', function() {
        //extracting node versions from returned html
  			var regex2 = /<a href="node-(.*?)\/">/gi
        var regex = /<a href="v(.*?)\/">/gi,
          match,
          available_node_versions = [];

        while (match = regex.exec(data)) {
          available_node_versions.push(match[1]);
        }
        while (match = regex2.exec(data)) {
          available_node_versions.push(match[1]);
        }

        return callback(null, available_node_versions);
      });
    }else{
      return callback({message: 'Could not connect to nodejs.org'});
    }
  });
};

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

Nodev.prototype.mkdir = function(version, callback) {
  var dir = path.join(this.install_dir, version);

  spawn('mkdir', [dir]).on('exit', function(code) {
    if (code > 0)
      return callback({message: 'Could not create directory', path: dir, code: code});

    return callback(null);
  });
};

Nodev.prototype.downloadPackage = function(version, callback) {
  var tmp_file = path.join(this.tmp_dir, 'node-v' + version + '.tar.gz'),
    link = 'http://nodejs.org/dist/v' + version + '/node-v' + version + '.tar.gz';

  spawn('wget', ['-O', tmp_file, link]).on('exit', function(code) {
    if (code > 0)
      return callback({message: 'Error downloading ' + link, code: code});

    return callback(null, tmp_file);
  });
};

Nodev.prototype.extractPackage = function(file, destination, callback) {
  spawn('tar', ['--strip-components=1', '-xzf', file, '-C', destination]).on('exit', function(code) {
    if (code > 0)
      return callback({message: 'Failed to extract Node package', code: code});

    return callback(null);
  });
};

Nodev.prototype.configure = function(node_dir, callback) {
  spawn('./configure', ['--prefix=' + node_dir], {cwd: node_dir}).on('exit', function(code) {
    if (code)
      return callback({message: 'Failed to configure Node build', code: code});

    return callback(null);
  });
};

Nodev.prototype.make = function(node_dir, callback) {
  spawn('make', [], {cwd: node_dir}).on('exit', function(code) {
    if (code > 0)
      return callback({message: 'Failed to make Node build', code: 0});

    return callback(null);
  });
};

Nodev.prototype.install = function(node_dir, callback) {
  spawn('make', ['install'], {cwd: node_dir}).on('exit', function(code) {
    if (code > 0)
      return callback({message: 'Failed to install Node build', code: code});

    return callback(null);
  });
};

Nodev.prototype.checkInstall = function(version, callback) {
  var self = this;

  console.log('Nodev:', 'finding install for Node ' + version);
  self.isInstalled(version, function(err, version_match) {
    if (version_match) {
      callback(null, version_match);
    }else{
      console.log('Nodev:', 'no install of Node ' + version + ', checking online');
      self.isAvailable(version, function(err, version_match) {
        if (err) {
          callback(err);
        }else{
          console.log('Nodev:', 'Node ' + version_match + ' available, creating local directory');
          self.mkdir(version_match, function(err) {
            if (err) {
              callback(err);
            }else{
              console.log('Nodev:', 'downloading package for Node ' + version_match);
              self.downloadPackage(version_match, function(err, download_path) {
                if (err) {
                  callback(err);
                }else{
                  var destination = path.join(self.install_dir, version_match);

                  console.log('Nodev:', 'extracting to ' + destination);
                  self.extractPackage(download_path, destination, function(err, extract_path) {
                    if (err) {
                      callback(err);
                    }else{
                      console.log('Nodev:', 'configuring ' + destination);
                      self.configure(destination, function(err) {
                        if (err) {
                          callback(err);
                        }else{
                          console.log('Nodev:', 'making ' + destination);
                          self.make(destination, function(err) {
                            if (err) {
                              callback(err);
                            }else{
                              console.log('Nodev:', 'installing ' + destination);
                              self.install(destination, function(err) {
                                if (err) {
                                  callback(err);
                                }else{
                                  console.log('Nodev:', 'Node ' + version_match + ' was successfully installed');
                                  callback(null, version_match);
                                }
                              });
                            }
                          });
                        }
                      });
                    }
                  });
                }
              });
            }
          });
        }
      });
    }
  });
};
