var http_proxy = require('http-proxy'),
  proxyModel = require('../models/proxy');

var Proxy = exports.Proxy = function(app, haibu) {
  var self = this;

  this.proxies = {};

  //small proxy api
  app.router.path('/proxies', function() {
    this.get(function() {
      var proxies = {};

      Object.keys(self.proxies).forEach(function(port) {
        if (!proxies[port])
          proxies[port] = {};

        proxies[port] = self.getBy(port);
      });

      haibu.sendResponse(this.res, 200, proxies);
    });

    this.get('/:port', function(port) {
      if (self.proxies[port])
        haibu.sendResponse(this.res, 200, self.getBy(port));
      else
        haibu.sendResponse(this.res, 500, {'message': 'No proxy on port ' + port});
    });

    this.post('/:port', function(port) {
      if (self.start(port))
        haibu.sendResponse(this.res, 200, {message: 'Proxy started on ' + port});
      else
        haibu.sendResponse(this.res, 500, {message: 'Could not start proxy on ' + port});
    });

    //arbitrary proxy routes
    this.post('/:port/set', function(port) {
      if (self.proxies[port]) {
        var pkg = {
          host: this.req.body.host,
          port: this.req.body.port
        };

        var route_message = this.req.body.domain + ':' + port + ' > ' + pkg.host + ':' + pkg.port;

        if (self.set(port, pkg, this.req.body.domain, true))
          haibu.sendResponse(this.res, 200, {message: 'Proxy route added: ' + route_message});
        else
          haibu.sendResponse(this.res, 500, {message: 'Could not create route: ' + route_message});
      }else{
        haibu.sendResponse(this.res, 500, {message: 'No proxy on port ' + port});
      }
    });

    this.post('/:port/delete_proxy', function(port) {
      if (self.clean(port)) {
        haibu.sendResponse(this.res, 200, {message: 'Proxy no longer running on ' + port});
      }else{
        haibu.sendResponse(this.res, 500, {message: 'No proxy on port ' + port});
      }
    });

    this.post('/:port/delete_route', function(port) {
      if (self.proxies[port]) {
        if (this.req.body.domain) {
          var domain = this.req.body.domain.trim();

          result = self.delete(port, domain);

          message = (result ? 'Route deleted' : 'No route found') + ' for ' + domain + ' on port ' + port;
        }else{
          var match = this.req.body || {},
            filters = [];

          result = self.deleteBy(port, match);

          message = (result ? 'Routes deleted' : 'No routes found') + ' for ';

          Object.keys(match).forEach(function(key) {
            filters.push(key + ' ' + match[key]);
          });

          message += filters.join(', ') + ' on port ' + port;
        }

        if (result)
          haibu.sendResponse(this.res, 200, {message: message});
        else
          haibu.sendResponse(this.res, 500, {message: message});
      }else{
        haibu.sendResponse(this.res, 500, {message: 'No proxy on port ' + port});
      }
    });

    this.get('/:port/:userid', function(port, userid) {
      haibu.sendResponse(this.res, 200, self.getBy(port, {user: userid}));
    });

    this.get('/:port/:userid/:appid', function(port, userid, appid) {
      haibu.sendResponse(this.res, 200, self.getBy(port, {user: userid, appid: appid}));
    });

    this.post('/:port/:userid/:appid/delete', function(port, userid, appid) {
      var message = 'routes for user ' + userid + ', app ' + appid + ' on  port ' + port;

      if (self.deleteBy(port, {user: userid, appid: appid}))
        haibu.sendResponse(this.res, 200, {message: 'Deleted ' + message});
      else
        haibu.sendResponse(this.res, 500, {message: 'Could not delete ' + message});
    });
  });
};

//starts a new proxy on given port
Proxy.prototype.start = function(port) {
  if (!this.proxies[port]) {
    var self = this;

    this.proxies[port] = {routes: {}};

    this.proxies[port].proxy = http_proxy.createServer(function(req, res, proxy) {
      //find target associated to domain
      var host = req.headers.host.split(':'),
        port = host[1] || 80;

      host = host[0];

      if (self.proxies[port].routes[host]) {
        //forward request to target
        proxy.proxyRequest(req, res, self.proxies[port].routes[host]);
      }
    });

    this.proxies[port].proxy.on('error', function(err) {
      //if proxy failed to start, remove it
      console.log('Could not start proxy on ' + port, err);
      delete self.proxies[port];
    });

    this.proxies[port].proxy.listen(port);

    return true;
  }

  return false;
};

//stops proxy on given port
Proxy.prototype.stop = function(port) {
  if (this.proxies[port]) {
    this.proxies[port].proxy.close();

    return true;
  }

  return false;
};

//stops and removes proxy entirely
Proxy.prototype.clean = function(port) {
  if (this.stop(port)) {
    delete this.proxies[port];

    return true;
  }

  return false;
};

//sets domain target
Proxy.prototype.set = function(port, pkg, domain, persist) {
  if (domain.trim() != '' && this.proxies[port] && pkg.host) {
    var target_port = (pkg.env ? pkg.env.PORT : null) || pkg.port;

    if (target_port) {
      this.proxies[port].routes[domain] = {
        host: pkg.host,
        port: target_port,
        user: pkg.user,
        appid: pkg.name,
        persist: persist
      };

      //save to db if persistent
      if (persist)
        proxyModel.createOrUpdate({host: domain, port: port}, this.proxies[port].routes[domain], function(){});

      return true;
    }
  }

  return false;
};

//load all routes by key values
Proxy.prototype.getBy = function(port, match) {
  if (this.proxies[port]) {
    var match = match || {},
      keys = Object.keys(match),
      domains = Object.keys(this.proxies[port].routes),
      routes = {},
      self = this;

    domains.forEach(function(domain) {
      var matched = true;

      for (var i in keys) {
        if (!self.proxies[port].routes[domain][keys[i]] || self.proxies[port].routes[domain][keys[i]] != match[keys[i]]) {
          matched = false;
          break;
        }
      }

      if (matched) {
        routes[domain] = self.proxies[port].routes[domain];

        //json-unfriendly 'target' gets added by http-proxy
        if (routes[domain].target)
          delete routes[domain].target;
      }
    });

    return routes;
  }

  return false;
};

//delete domain target
Proxy.prototype.delete = function(port, domain) {
  if (this.proxies[port] && this.proxies[port].routes[domain]) {
    //remove from db if persistent
    if (this.proxies[port].routes[domain].persist)
      proxyModel.deleteBy({source: {host: domain, port: port}}, console.log);

    delete this.proxies[port].routes[domain];

    return true;
  }

  return false;
};

//delete by key values
Proxy.prototype.deleteBy = function(port, match) {
  var self = this;

  if (this.proxies[port]) {
    Object.keys(this.getBy(port, match)).forEach(function(domain) {
      self.delete(port, domain);
    });

    return true;
  }

  return false;
};

//load all the domains from a package
Proxy.prototype.load = function(port, pkg) {
  var self = this;

  if (this.proxies[port]) {
    ['domain', 'domains', 'subdomain', 'subdomains'].forEach(function(key) {
      if (pkg[key]) {
        var domains = pkg[key];

        if (typeof domains == 'string')
          domains = domains.split(' ');

        domains.forEach(function(domain) {
          self.set(port, pkg, domain);
        });
      }
    });

    return true;
  }

  return false;
};

//load all persistent routes from db
Proxy.prototype.autoload = function() {
  var self = this;

  proxyModel.get(function(err, routes) {
    if (err)
      return console.log(err);

    if (routes.length > 0) {
      routes.forEach(function(route) {
        //create proxy if it doesn't exist
        if (!self.proxies[route.source.port])
          self.start(route.source.port);

        self.set(route.source.port, route.target, route.source.host, true);
      });
    }
  });
};