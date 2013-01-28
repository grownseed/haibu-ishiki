# Haibu Ishiki

Wrapper for [Haibu](https://github.com/nodejitsu/haibu) and [Http-Proxy](https://github.com/nodejitsu/node-http-proxy)

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

Usage:
```bash
node ./node_modules/haibu-ishiki/index.js
```

Or to install globally (preferred):

```bash
npm install haibu-ishiki -g
```

Usage:
```bash
ishiki
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
  "mongodb": {
    "host": "127.0.0.1",
    "port": "27017",
    "database": "ishiki"
  },
  "logs-size": 100000,
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
* `mongodb` is the configuration for the MongoDB database
* `logs-size` is the cap on the `log` MongoDB collection where all the user/app logs go
* `haibu` is whatever settings are available to the haibu module

<a name="api"/>
## API

Ishiki provides its own API

### Drones

#### `/drones` (`GET`)
Returns a list of all drones

##### Call example
```bash
curl -X GET <ishiki-ip>:<ishiki-port>/drones
```

##### Response
```json
{ "drones" : [ { "_id" : "5104b15d936de54dd7000001",
        "dependencies" : { "express" : "3.0.6",
            "jade" : "*"
          },
        "directories" : { "home" : "user1-site1-1359269108855" },
        "domains" : "my.domain my.other.domain",
        "drones" : null,
        "engines" : { "node" : ">=0.8.0 <0.9.0" },
        "env" : { "PORT" : 9080 },
        "hash" : "811b9b44168d3cabcca54e67269f30a155da3f7e",
        "host" : "127.0.0.1",
        "name" : "site1",
        "private" : true,
        "repository" : { "directory" : "/home/bobthebuilder/node/haibu-ishiki/deployment/packages/user1-site1-1359269108855",
            "type" : "local"
          },
        "scripts" : { "start" : "app.js" },
        "started" : true,
        "uid" : "1QCm",
        "user" : "user1"
      },
    ] }
```

`drones` basically contains an array of the apps' `package.json` with a few added properties.

---

#### `/drones/:userid` (`GET`)
Returns all drones for a given user

##### Call example
```bash
curl -X GET <ishiki-ip>:<ishiki-port>/drones/user1
```

##### Response
Same as `/drones` only with results being limited to specified user

---

#### `/drones/:userid/:appid` (`GET`)
Returns drone info for given user/app

##### Call example
```bash
curl -X GET <ishiki-ip>:<ishiki-port>/drones/user1/site1
```

##### Response
Same as `/drones` only with results being limited to specified user and app

---

#### `/drones/running` (`GET`)
Returns all running drones

##### Call example
```bash
curl -X GET <ishiki-ip>:<ishiki-port>/drones/running
```

##### Response
Same as `/drones` only with results being limited to drones that are started

---

#### `/drones/:userid/:appid/deploy` (`POST`)
Deploys an app from a tarball for given user/app, with Curl from your app's directory:

##### Call example
```bash
tar -cz . | curl -XPOST -m 360 -sSNT- <ishiki-ip>:<ishiki-port>/drones/user1/site1/deploy
```

##### Response
If anything goes wrong, an error will be returned, otherwise the raw drone's info will be returned.
If the version of Node required by the new app being deployed isn't installed yet, it will be installed on the fly,
which could very well mean that the query will timeout (hence `-m 360` to allow to wait for 3 minutes).
The installation of Node will keep going regardless and the application will be deployed right after.
You can also check your application logs or the drones API to check the status of your drone.

---

#### `/drones/:userid/:appid/start` (`POST`)
Starts a previously stopped drone for given user/app

##### Call example
```bash
curl -X POST <ishiki-ip>:<ishiki-port>/drones/user1/site1/start
```

##### Response
```json
{ "_id" : "5104b15d936de54dd7000001",
  "dependencies" : { "express" : "3.0.6",
      "jade" : "*"
    },
  "directories" : { "home" : "user1-site1-1359269108855" },
  "domains" : "my.domain my.other.domain",
  "drones" : null,
  "engines" : { "node" : "0.8.x" },
  "env" : { "PORT" : 9080 },
  "hash" : "811b9b44168d3cabcca54e67269f30a155da3f7e",
  "host" : "127.0.0.1",
  "name" : "site1",
  "port" : 9080,
  "private" : true,
  "repository" : { "directory" : "/home/bobthebuilder/node/haibu-ishiki/deployment/packages/user1-site1-1359269108855",
      "type" : "local"
    },
  "scripts" : { "start" : "app.js" },
  "started" : true,
  "uid" : "1QCm",
  "user" : "user1"
}
```

---

#### `/drones/:userid/:appid/stop` (`POST`)
Stops a running drone for given user/app

##### Call example
```bash
curl -X POST <ishiki-ip>:<ishiki-port>/drones/user1/site1/stop
```

##### Response
Same output as `/drones/:userid/:appid/start` with `started` set to `false`

---

#### `/drones/:userid/:appid/restart` (`POST`)
Restarts a running drone for given user/app

##### Call example
```bash
curl -X POST <ishiki-ip>:<ishiki-port>/drones/user1/site1/restart
```

##### Response
Same output as `/drones/:userid/:appid/start`

---

#### `/drones/:userid/:appid/logs` (`GET`)
Returns or streams the logs for a given app with optional filtering

##### Available filters
* `type`: `'info'` or `'error'` (defaults to both)
* `limit`: number of results (defaults to 10)
* `stream`: will create a stream on the log, essentially `tail -f`-ing it (changes output)

##### Call example - basic
```bash
curl -X GET -H 'Content-Type: application/json' -d '{"limit": 2}' <ishiki-ip>:<ishiki-port>/drones/user1/site1/logs
```

##### Response (JSON)
```json
[ { "_id" : "5105ee9ee55d533f01000004",
    "app" : "site1",
    "msg" : "Express server started on port 1234\n",
    "ts" : "2013-01-28T03:21:02.498Z",
    "type" : "info",
    "user" : "user1"
  },
  { "_id" : "5105ee9de55d533f01000003",
    "app" : "site1",
    "msg" : "me so hungry\n",
    "ts" : "2013-01-28T03:21:01.499Z",
    "type" : "info",
    "user" : "user1"
  }
]
```

##### Call example - streaming
```bash
curl -X GET -H 'Content-Type: application/json' -d '{"stream": true}' <ishiki-ip>:<ishiki-port>/drones/user1/site1/logs
```

##### Response (plain text)
```
[Sun Jan 27 2013 22:19:57 GMT-0500 (EST)] [info] Express server started on port 1234
[Sun Jan 27 2013 22:19:58 GMT-0500 (EST)] [info] me so hungry
...
```

### Proxy

#### `/proxies` (`GET`)
Returns a list of all proxies and associated routes

##### Call example
```bash
`curl -X GET <ishiki-ip>:<ishiki-port>/proxies`
```

##### Response
```json
{
  "80":{
    "test":{
      "host":"127.0.0.1",
      "port":9080,
      "user":"user1",
      "appid":"test"
    },
    "test.local":{
      "host":"127.0.0.1",
      "port":9080,
      "user":"user1",
      "appid":"test"
    }
  }
}
```

The top key is the port the proxy runs on, all the children are the internal target for the proxy for each domain.

---

#### `/proxies/:port` (`GET`)
Returns a list of all routes for proxy on given port

##### Call example
```bash
curl -X GET <ishiki-ip>:<ishiki-port>/proxies/80
```

##### Response example
```json
{
  "test":{
    "host":"127.0.0.1",
    "port":9080,
    "user":"user1",
    "appid":"test"
  },
  "test.local":{
    "host":"127.0.0.1",
    "port":9080,
    "user":"user1",
    "appid":"test"
  }
}
```

---

#### `/proxies/:port` (`POST`)
Starts a proxy on given port

##### Call example
```bash
curl -X POST <ishiki-ip>:<ishiki-port>/proxies/1234
```

##### Response
```json
{"message":"Proxy started on 1234"}
```

---

#### `/proxies/:port/set` (`POST`)
Updates or creates an arbitrary route for proxy on given port with source `domain`
and target `host` and `port` provided in `POST`. Routes created like this will be re-loaded when Ishiki restarts

##### Call example
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"port": "12500","host": "internal.ip","domain": "my.domain"}' <ishiki-ip>:<ishiki-port>/proxies/80/set
```

##### Response
```json
{"message":"Proxy route added: my.domain:80 > internal.ip:12500"}
```

---

#### `/proxies/:port/delete_proxy` (`POST`)
Stops and removes proxy and associated routes on given port

##### Call example
```bash
curl -X POST <ishiki-ip>:<ishiki-port>/proxies/1234/delete_proxy
```

##### Response
```json
{"message":"Proxy no longer running on 1234"}
```

---

#### `/proxies/:port/delete_route` (`POST`)
If `domain` is provided in `POST`, corresponding route will be removed from proxy on given port.
If `domain` is not provided, then all routes matching the contents of `POST` for proxy on given port will be deleted.
In this case `POST` can have any of the following values for matching:
```json
{
  "host": "1.2.3.4",
  "port": 1234,
  "user": "myuser",
  "appid": "myapp"
}
```

##### Call example
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"domain":"my.domain"}' <ishiki-ip>:<ishiki-port>/proxies/1234/delete_route
```

##### Response
```json
{"message":"Route deleted for my.domain on port 1234"}
```

---

#### `/proxies/:port/:userid` (`GET`)
Returns all routes for given user for proxy on given port

##### Call example
```bash
curl -X GET <ishiki-ip>:<ishiki-port>/proxies/80/user1
```

##### Response
```json
{
  "site1.com":{
    "host":"127.0.0.1",
    "port":9080,
    "user":"user1",
    "appid":"site1"
  },
  "site2.com":{
    "host":"127.0.0.1",
    "port":9081,
    "user":"user1",
    "appid":"site2"
  }
}
```

---

#### `/proxies/:port/:userid/:appid` (`GET`)
Returns all routes for given user/app for proxy on given port

##### Call example
```bash
curl -X GET <ishiki-ip>:<ishiki-port>/proxies/80/user1/site1
```

##### Response
```json
{
  "site1.com":{
    "host":"127.0.0.1",
    "port":9080,
    "user":"user1",
    "appid":"site1"
  }
}
```

---

#### `/proxies/:port/:userid/:appid/delete` (`POST`)
Deletes route for given user/app for proxy on given port

##### Call example
```bash
curl -X POST <ishiki-ip>:<ishiki-port>/proxies/80/user1/site1/delete
```

##### Response
```json
{"message":"Deleted routes for user user1, app site1 on port 80"}
```

## Things to check before deploying an app

### Domains

In your app's `package.json`, make sure you have at least one of `domain`, `domains`, `subdomain` and `subdomains`.
These can be arrays or space-separated list of domains. These are used for proxy mapping. If not specified you can
always set a new proxy route manually using the API.

### Port

When your app runs a server, make sure it listens on `process.env.PORT`. While it still works without, it ensures that
Ishiki will use one of the ports within the proxy port range defined in your configuration.

## Dependencies

* [union (0.3.6)](https://github.com/flatiron/union/tree/v0.3.6)
* [flatiron (0.3.3)](https://github.com/flatiron/flatiron/tree/v0.3.3)
* [haibu (0.9.7)](https://github.com/nodejitsu/haibu)
* [semver (1.1.2)](https://github.com/isaacs/node-semver/tree/v1.1.2)
* [tar (0.1.14)](https://github.com/isaacs/node-tar/tree/v0.1.14)
* [http-proxy (0.8.7)](https://github.com/nodejitsu/node-http-proxy/tree/v0.8.7)
* [mongodb (1.2.x)](https://github.com/mongodb/node-mongodb-native/tree/V1.2.10)

## Requirements

* Node 0.8.x
* MongoDB database
* root access (or sufficient rights) to run `configure && make && make install` to install Node versions

## To Do

* [~~drone start/stop/restart API~~](https://github.com/grownseed/haibu-ishiki/commit/d889e89cb9d1fe225055d88c03a535223f9944c2)
* [~~automatically restart drones on server start~~](https://github.com/grownseed/haibu-ishiki/commit/0c17c1ca8c8f84bd536176d33955118260ace4ea)
* add user authentication and permissions
* [~~allow for persistent proxy routes~~](https://github.com/grownseed/haibu-ishiki/commit/b054cdb4e9bb9d9b0f95aa6a2acc3e66889f588e)
* [~~user/app logs~~](https://github.com/grownseed/haibu-ishiki/commit/51145635d06fa6b78e4bd739d1c67e2612f65bb7) and [~~log streaming~~](https://github.com/grownseed/haibu-ishiki/commit/ed1a7d6f76c7a3974be7d6fb0fe7f18b9f73a78c)
* tighten security for each user/drone
* create an easy-to-use client NPM module to work with Ishiki
* create a client interface for the browser

## License

[MIT License](https://github.com/grownseed/haibu-ishiki/blob/master/LICENSE)