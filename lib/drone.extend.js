var crypto = require('crypto'),
  fs = require('fs'),
  path = require('path'),
  zlib = require('zlib'),
  tar = require('tar'),
  haibu = require('haibu');

//add deploy without autostart to drone
module.exports = function (userId, appId, stream, callback) {
  var untarDir = path.join(this.packagesDir, [userId, appId, Date.now()].join('-')),
    sha = crypto.createHash('sha1'),
    self = this;

  function updateSha (chunk) {
    sha.update(chunk);
  }

  //
  // Update the shasum for the package being streamed
  // as it comes in and prehash any buffered chunks.
  //
  stream.on('data', updateSha);
  if (stream.chunks) {
    stream.chunks.forEach(updateSha);
  }

  //
  // Handle error caused by `zlib.Gunzip` or `tar.Extract` failure
  //
  function onError(err) {
    err.usage = 'tar -cvz . | curl -sSNT- HOST/deploy/USER/APP';
    err.blame = {
      type: 'system',
      message: 'Unable to unpack tarball'
    };
    return callback(err);
  }

  function onEnd() {
    //
    // Stop updating the sha since the stream is now closed.
    //
    stream.removeListener('data', updateSha);

    //
    // When decompression is done, then read the `package.json`
    // file and attempt to start the drone via `this.start()`.
    //
    haibu.common.file.readJson(path.join(untarDir, 'package.json'), function (err, pkg) {
      if (err) {
        err.usage = 'Submit a tar with a package.json containing a start script';
        err.pkg = pkg;
        return callback(err);
      }

      pkg = pkg || {};

      var pkg_keys = Object.keys(pkg);

      //validate app package
      if (pkg_keys.length == 0) {
        return callback({message: 'package.json is empty'});
      }else{
        var errors = [];

        //check for app name
        if (!pkg.name || (pkg.name && pkg.name.trim() == ''))
          errors.push('`name` is required');

        //check for user
        if (!pkg.user || (pkg.user && pkg.user.trim() == ''))
          errors.push('`user` is required');

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
        var domains = [];
        ['domain', 'domains', 'subdomain', 'subdomains'].forEach(function(key) {
          if (pkg[key]) {
            if (typeof pkg[key] == 'string')
              pkg[key] = pkg[key].split(' ');

            pkg[key].forEach(function(d) {
              if (d.trim() != '')
                domains.push(d);
            });
          }
        });

        if (domains.length == 0)
          errors.push('at least one of `domain`, `domains`, `subdomain` or `subdomains` is required');

        //check env isn't wrongly set
        if (pkg.env) {
          if (typeof pkg.env != 'object')
            errors.push('if specified, `env` has to be an object');
        }

        //return errors if there are any
        if (errors.length > 0) {
          var message = 'There are issues with your package.json file:\n' + errors.join('\n');

          return callback({message: message});
        }
      }

      pkg.user = userId;
      pkg.name = appId;
      pkg.hash = sha.digest('hex');
      pkg.repository = {
        type: 'local',
        directory: untarDir
      };



      callback(null, pkg);
    });
  }

  //
  // Create a temporary directory to untar the streamed data
  // into and pipe the stream data to a child `tar` process.
  //
  fs.mkdir(untarDir, '0755', function (err) {
    //
    // Create a tar extractor and pipe incoming stream to it.
    //
    stream.pipe(zlib.Gunzip())
      .on('error', onError)
      .pipe(new tar.Extract({ path: untarDir }))
      .on('error', onError)
      .on('end', onEnd);
  });
};