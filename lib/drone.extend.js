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
    return callback({message: 'Unable to unpack tarball'});
  }

  function onEnd() {
    //
    // Stop updating the sha since the stream is now closed.
    //
    stream.removeListener('data', updateSha);

    //
    // When decompression is done, then read the `package.json`
    // file
    //
    haibu.common.file.readJson(path.join(untarDir, 'package.json'), function (err, pkg) {
      if (err) {
        err.usage = 'Submit a tar with a package.json containing a start script';
        err.pkg = pkg;
        return callback(err);
      }

      pkg = pkg || {};
      
      pkg.user = userId;
      pkg.name = appId;
      pkg.hash = sha.digest('hex');
      //if (!pkg.repository) {
        pkg.repository = {
          type: 'local',
          directory: untarDir
        };
      //}

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