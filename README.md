# Haibu Ishiki

Wrapper for Haibu, Http Proxy and Carapace.

## What does it do?

It makes running a Node deployment server as painless as possible.

## How does it work?

After starting Ishiki, an [API](#api) will be made available. With this API, you can deploy applications and manage
them. If your application requires a specific version of Node, it will be set up automatically for you. Each application
will run on its own IP:port internally, while being proxied through the domains specified on your app on whatever public
port you want your sites to run on (e.g. 80).

## Disclaimer

Ishiki is provided as is and, as it stands, should not be used for production.

## Install

```bash
npm install haibu-ishiki
```

Or to install globally:

```bash
npm install haibu-ishiki -g
```

## Configuration

By default, Ishiki will run on the following settings:

```json
{
  "host": "127.0.0.1",
  "port": "8080",
  "public-port": "80",
  "deploy-dir": "deployment",
  "port-range": {
    "min": "9080",
    "max": "10080"
  },
  "haibu": {
    "env": "development",
    "advanced-replies": true,
    "useraccounts": true,
    "coffee": true,
    "directories": {
      "node-installs": "node-installs",
      "packages": "packages",
      "apps": "apps",
      "tmp": "tmp"
    }
  }
}
```

Copy `config.sample.js` to `config.js` and modify if you want your own settings.

* `host` is the host Ishiki and its API will run on
* `port` is the port Ishiki and its API will run on
* `public-port` is the port the apps will be made available on to the public (proxy port)
* `deploy-dir` is where all the directories defined under `haibu`.`directories` go (defaults to `<ishiki-dir>/deployment`)
* `port-range` is the range of ports the apps will listen on internally before being proxied
* `haibu` is whatever settings are available to the haibu module

<a name="api"/>
## API

Ishiki provides its own API

### Drones

#### `/drones` (`GET`)
Returns a list of all drones

#### `/drones/:userid` (`GET`)
Returns all drones for a given user

#### `/drones/:userid/:appid` (`GET`)
Returns drone info for given user/app

#### `/drones/running` (`GET`)
Returns all running drones

#### `/drones/:userid/:appid/deploy` (`POST`)
Deploys an app from a tarball for given user/app, with Curl from your app's directory:
```bash
tar -cz . | curl -XPOST -m 360 -sSNT- <ishiki-ip>:<ishiki-port>/drones/<user>/<app>/deploy
```

#### `/drones/:userid/:appid/start` (`POST`)
Starts a previously stopped drone for given user/app

#### `/drones/:userid/:appid/stop` (`POST`)
Stops a running drone for given user/app

#### `/drones/:userid/:appid/restart` (`POST`)
Restarts a running drone for given user/app

### Proxy

#### `/proxies` (`GET`)
Returns a list of all proxies and associated routes

#### `/proxies/:port` (`GET`)
Returns a list of all routes for proxy on given port

#### `/proxies/:port` (`POST`)
Starts a proxy on given port

#### `/proxies/:port/set` (`POST`)
Updates or creates an arbitrary route for proxy on given port with source `domain`
and target `host` and `port` provided in `POST`

#### `/proxies/:port/delete_proxy` (`POST`)
Stops and removes proxy and associated routes on given port

#### `/proxies/:port/delete_route` (`POST`)
If `domain` is provided in `POST`, corresponding route will be removed from proxy on given port.
If `domain` is not provided, then all routes matching the contents of `POST` for proxy on given port will be deleted.
In this case `POST` can have any of the following values for matching:
```json
{
  host: 1.2.3.4,
  port: 1234,
  user: 'myuser',
  appid: 'myapp'
}
```

#### `/proxies/:port/:userid` (`GET`)
Returns all routes for given user for proxy on given port

#### `/proxies/:port/:userid/:appid` (`GET`)
Returns all routes for given user/app for proxy on given port

#### `/proxies/:port/:userid/delete` (`POST`)
Deletes route for given user/app for proxy on given port

## Dependencies

* [union (0.3.6)](https://github.com/flatiron/union/tree/v0.3.6)
* [flatiron (0.3.3)](https://github.com/flatiron/flatiron/tree/v0.3.3)
* [haibu (0.9.7)](https://github.com/nodejitsu/haibu)
* [semver (1.1.2)](https://github.com/isaacs/node-semver/tree/v1.1.2)
* [tar (0.1.14)](https://github.com/isaacs/node-tar/tree/v0.1.14)
* [http-proxy (0.8.7)](https://github.com/nodejitsu/node-http-proxy/tree/v0.8.7)

## Requirements

* Node 0.8.x
* root access (or sufficient rights) to run `configure && make && make install` to install Node versions

## To Do

* automatically restart drones on server start
* add user authentication and permissions
* allow for persistent proxy routes
* tighten security for each user/drone
* create an easy-to-use client NPM module to work with Ishiki
* create a client interface for the browser

## License

[MIT License](https://github.com/grownseed/haibu-ishiki/blob/master/LICENSE)