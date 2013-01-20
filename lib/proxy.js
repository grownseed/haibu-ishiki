var http_proxy = require('http-proxy');

var Proxy = exports.Proxy = function(app, haibu) {
  var self = this;

  //start proxy server
  http_proxy.createServer(function(req, res, proxy) {
    //find target associated to domain
    var host = req.headers.host.split(':')[0];
    if (self.routes[host]) {
      //forward request to target
      proxy.proxyRequest(req, res, self.routes[host]);
    }
  }).listen(app.config.get('public-port'));

  this.routes = {};

  //small proxy api
  app.router.path('/proxy', function() {
    this.get(function() {
      haibu.sendResponse(this.res, 200, self.routes);
    });

    this.get('/:userid', function(userid) {
      haibu.sendResponse(this.res, 200, self.getBy({user: userid}));
    });

    this.get('/:userid/:appid', function(userid, appid) {
      haibu.sendResponse(this.res, 200, self.getBy({user: userid, appid: appid}));
    });

    this.post('/delete', function() {
      if (this.req.body.domain)
        self.delete(this.req.body.domain);
      else
        self.deleteBy(this.req.body || {});

      haibu.sendResponse(this.res, 200, {});
    });
  });
};

//sets domain target
Proxy.prototype.set = function(pkg, domain) {
  if (domain.trim() != '') {
    this.routes[domain] = {
      host: pkg.host,
      port: pkg.port,
      user: pkg.user,
      appid: pkg.name
    };
  }
};

//load all routes by key values
Proxy.prototype.getBy = function(match) {
  var keys = Object.keys(match),
    domains = Object.keys(this.routes),
    routes = {},
    self = this;

  domains.forEach(function(domain) {
    var matched = true;

    for (var i in keys) {
      if (self.routes[domain][keys[i]] != match[keys[i]]) {
        matched = false;
        break;
      }
    }

    if (matched)
      routes[domain] = self.routes[domain];
  });

  return routes;
};

//delete domain target
Proxy.prototype.delete = function(domain) {
  if (this.routes[domain])
    delete this.routes[domain];
};

//delete by key values
Proxy.prototype.deleteBy = function(match) {
  var self = this;

  Object.keys(this.getBy(match)).forEach(function(domain) {
    self.delete(domain);
  });
};

//load all the domains from a package
Proxy.prototype.load = function(pkg) {
  var self = this;

  ['domain', 'domains', 'subdomain', 'subdomains'].forEach(function(key) {
    if (pkg[key]) {
      var domains = pkg[key];

      if (typeof domains == 'string')
        domains = domains.split(' ');

      domains.forEach(function(domain) {
        self.set(pkg, domain);
      });
    }
  });
};

