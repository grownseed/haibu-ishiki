# Ishiki

Wrapper for [Haibu](https://github.com/nodejitsu/haibu) and [Http-Proxy](https://github.com/nodejitsu/node-http-proxy)

Please refer to [Hachi](https://github.com/grownseed/hachi) for a simple API client module and command line tool.

## What does it do?

It makes running a Node deployment server as painless as possible. It is currently aimed at people with single-server
installations who intend to run a small development platform.

## How does it work?

After starting Ishiki, an [API](#api) will become available. With this API, you can deploy applications and manage
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

### First time

When starting Ishiki for the first time, a default admin user will be created for you and a random password will be generated.
Ishiki should output something along the lines of:

```
Initial admin account created:
> username: ishiki
> password: 12345667890abcdef
```

Make sure you take good note of the password (you can change it later).

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
  "auth": {
    "active": true,
    "admin": "ishiki",
    "token_expiry": 1800
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

Copy `config.sample.js` to `config.js` and modify it if you want your own settings.

* `host` is the host Ishiki and its API will run on
* `port` is the port Ishiki and its API will run on
* `public-port` is the port the apps will be made available on to the public (proxy port)
* `deploy-dir` is where all the directories defined under `haibu`.`directories` go (defaults to `<ishiki-dir>/deployment`)
* `port-range` is the range of ports the apps will listen on internally before being proxied
* `mongodb` is the configuration for the MongoDB database
* `logs-size` is the cap on the `log` MongoDB collection where all the user/app logs go
* `auth` is for authentication. Set `active` to `false` to disable authentication, `admin` is the default admin username, `token_expiry` is the time in seconds a token can remain valid without activity (`false` for no expiry)
* `haibu` is whatever settings are available to the haibu module

__Running Ishiki over HTTPS__

If you specify `https` in your configuration file, Ishiki will automatically run over HTTPS instead of HTTP, e.g.:

```json
"https": {
  "cert": "cert/ishiki.crt",
  "key": "cert/ishiki.key",
  "ca": "cert/ca.pem"
}
```

All subsequent calls to Ishiki's API will need to take this into account, with cURL for instance, add the `-3` (or `--sslv3`) flag.

The `ca` (certificate authority) can be omitted if using a self-signed certificate. You will also need to run cURL with
the `-k` (or `--insecure`) flag to ignore the verification.

<a name="api"/>

## API

With authentication turned on (default), all calls (except for `/users/login`) will need to explicitly specify a `token` in the URL, such as:
```bash
<http|https>://<ishiki-ip>:<ishiki-port>/<end-point>?token=<my-token>
```

The authentication token can be created with the help of [`/users/login`](#users_login_post)

#### _Permissions_

With the exception of logging in, permissions are as follow:

* [__users__](#users): admins can perform any action for any user, non-admins can only update their own password
* [__drones__](#drones): admins can performs any action for any user, non-admins can only perform actions relating to their own drones (where `/:userid` is present)
* [__proxies__](#proxies): only admins may use this

#### _Overview_

* [Users](#users)
 * [Get all users](#users_get)
 * [Create a new user](#users_post)
 * [Log-in (get an authentication token)](#users_login_post)
 * [Log-out](#users_logout_post)
 * [Update user details](#users_user_post)
* [Drones](#drones)
 * [Get all drones](#drones_get)
 * [Get drones for a given user](#drones_user_get)
 * [Get drone for a given user and app](#drones_user_app_get)
 * [Get running drones](#drones_running_get)
 * [Deploy an app](#drones_user_app_deploy_post)
 * [Start an app](#drones_user_app_start_post)
 * [Stop an app](#drones_user_app_stop_post)
 * [Restart an app](#drones_user_app_restart_post)
 * [Get app logs](#drones_user_app_logs_get)
* [Proxies](#proxies)
 * [Get all proxy routes](#proxies_get)
 * [Get all proxy routes for a given port](#proxies_port_get)
 * [Start a proxy on a new port](#proxies_port_post)
 * [Manually create a proxy route on a given port](#proxies_port_set_post)
 * [Stop proxy on a given port and clear its routes](#proxies_port_delete_proxy_post)
 * [Delete proxy routes on a given port](#proxies_port_delete_route_post)
 * [Get all proxy routes for a given user and port](#proxies_port_user_get)
 * [Get all proxy routes for a given app, user and port](#proxies_port_user_app_get)
 * [Delete routes for a given app, user and port](#proxies_port_user_app_delete_post)

---

<a name="users"/>

### Users

<a name="users_get"/>

#### `/users` (`GET`)
Returns a list of all users

#### Call example
```bash
curl -X GET <http|https>://<ishiki-ip>:<ishiki-port>/users?token=<my-token>
```

#### Response
```json
[ { "_id" : "51b12470b4a898d990000001",
    "admin" : true,
    "last_access" : "2013-06-08T22:47:22.828Z",
    "password" : "$2a$10$TtuNxZzX3bHdQSURpLLv4OHZ1QjbW2Fy6yRs3Cv1p6w414OnoOnTi",
    "token" : "d22b9961e33700436c76acfab2051ba73276b7fb5aa9e57bb1343fc9e5b1524f",
    "username" : "ishiki"
  } ]
```

---

<a name="users_post"/>

#### `/users` (`POST`)
Creates a new user, if `password` is not provided, one will be generated. Set `admin` to `true` to give the new user admin rights.

##### Call example
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"username": "myuser"}' <http|https>://<ishiki-ip>:<ishiki-port>/users?token=<my-token>
```

##### Response
```json
{ "_id" : "51b390b90808e68d93000067",
  "admin" : false,
  "password" : "52360f1b10488ae7",
  "username" : "myuser"
}
```

---

<a name="users_login_post"/>

#### `/users/login` (`POST`)
Returns an authentication token to be used for all other calls

##### Call example
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"username": "myuser", "password": "mypassword"}' <http|https>://<ishiki-ip>:<ishiki-port>/users/login
```

##### Response
```json
{ "token" : "f2623f7d089e58069caf123bda4eba614b30b67e20f90074bf7dfd6241e2e0e1" }
```

---

<a name="users_logout_post"/>

#### `/users/logout` (`POST`)
Revokes authentication token

##### Call example
```bash
curl -X POST <http|https>://<ishiki-ip>:<ishiki-port>/users/logout?token=<my-token>
```

##### Response
```json
{ "message" : "You are no longer authenticated" }
```

---

<a name="users_user_post"/>

#### `/users/:userid` (`POST`)
Updates a user, non-admin users can only update their own password, admins can update any details of any users with the exception of the `username`

##### Call example
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"password": "mynewpassword"}' <http|https>://<ishiki-ip>:<ishiki-port>/users/myuser?token=<my-token>
```

#### Response
```json
{ "message" : "Updated password" }
```

<a name="drones"/>

### Drones

<a name="drones_get"/>

#### `/drones` (`GET`)
Returns a list of all drones

##### Call example
```bash
curl -X GET <http|https>://<ishiki-ip>:<ishiki-port>/drones?token=<my-token>
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

<a name="drones_user_get"/>

#### `/drones/:userid` (`GET`)
Returns all drones for a given user

##### Call example
```bash
curl -X GET <http|https>://<ishiki-ip>:<ishiki-port>/drones/user1?token=<my-token>
```

##### Response
Same as `/drones` only with results being limited to specified user

---

<a name="drones_user_app_get"/>

#### `/drones/:userid/:appid` (`GET`)
Returns drone info for given user/app

##### Call example
```bash
curl -X GET <http|https>://<ishiki-ip>:<ishiki-port>/drones/user1/site1?token=<my-token>
```

##### Response
Same as `/drones` only with results being limited to specified user and app

---

<a name="drones_running_get"/>

#### `/drones/running` (`GET`)
Returns all running drones

##### Call example
```bash
curl -X GET <http|https>://<ishiki-ip>:<ishiki-port>/drones/running?token=<my-token>
```

##### Response
Same as `/drones` only with results being limited to drones that are started

---

<a name="drones_user_app_deploy_post"/>

#### `/drones/:userid/:appid/deploy` (`POST`)
Deploys an app from a tarball for given user/app, with Curl from your app's directory:

##### Call example
```bash
tar -cz . | curl -XPOST -m 360 -sSNT- <http|https>://<ishiki-ip>:<ishiki-port>/drones/user1/site1/deploy?token=<my-token>
```

##### Response
If anything goes wrong, an error will be returned, otherwise the raw drone's info will be returned.
If the version of Node required by the new app being deployed isn't installed yet, it will be installed on the fly,
which could very well mean that the query will timeout (hence `-m 360` to allow to wait for 3 minutes).
The installation of Node will keep going regardless and the application will be deployed right after.
You can also check your application logs or the drones API to check the status of your drone.

---

<a name="drones_user_app_start_post"/>

#### `/drones/:userid/:appid/start` (`POST`)
Starts a previously stopped drone for given user/app

##### Call example
```bash
curl -X POST <http|https>://<ishiki-ip>:<ishiki-port>/drones/user1/site1/start?token=<my-token>
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

<a name="drones_user_app_stop_post"/>

#### `/drones/:userid/:appid/stop` (`POST`)
Stops a running drone for given user/app

##### Call example
```bash
curl -X POST <http|https>://<ishiki-ip>:<ishiki-port>/drones/user1/site1/stop?token=<my-token>
```

##### Response
Same output as `/drones/:userid/:appid/start` with `started` set to `false`

---

<a name="drones_user_app_restart_post"/>

#### `/drones/:userid/:appid/restart` (`POST`)
Restarts a running drone for given user/app

##### Call example
```bash
curl -X POST <http|https>://<ishiki-ip>:<ishiki-port>/drones/user1/site1/restart?token=<my-token>
```

##### Response
Same output as `/drones/:userid/:appid/start`

---

<a name="drones_user_app_logs_get"/>

#### `/drones/:userid/:appid/logs` (`GET`)
Returns or streams the logs for a given app with optional filtering

##### Available filters
* `type`: `'info'` or `'error'` (defaults to both)
* `limit`: number of results (defaults to 10)
* `stream`: will create a stream on the log, essentially `tail -f`-ing it (changes output)

##### Call example - basic
```bash
curl -X GET -H 'Content-Type: application/json' -d '{"limit": 2}' <http|https>://<ishiki-ip>:<ishiki-port>/drones/user1/site1/logs?token=<my-token>
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
curl -X GET -H 'Content-Type: application/json' -d '{"stream": true}' <http|https>://<ishiki-ip>:<ishiki-port>/drones/user1/site1/logs?token=<my-token>
```

##### Response (plain text)
```
[Sun Jan 27 2013 22:19:57 GMT-0500 (EST)] [info] Express server started on port 1234
[Sun Jan 27 2013 22:19:58 GMT-0500 (EST)] [info] me so hungry
...
```

<a name="proxies"/>

### Proxy

<a name="proxies_get"/>

#### `/proxies` (`GET`)
Returns a list of all proxies and associated routes

##### Call example
```bash
curl -X GET <http|https>://<ishiki-ip>:<ishiki-port>/proxies?token=<my-token>
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

<a name="proxies_port_get"/>

#### `/proxies/:port` (`GET`)
Returns a list of all routes for proxy on given port

##### Call example
```bash
curl -X GET <http|https>://<ishiki-ip>:<ishiki-port>/proxies/80?token=<my-token>
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

<a name="proxies_port_post"/>

#### `/proxies/:port` (`POST`)
Starts a proxy on given port

##### Call example
```bash
curl -X POST <http|https>://<ishiki-ip>:<ishiki-port>/proxies/1234?token=<my-token>
```

##### Response
```json
{"message":"Proxy started on 1234"}
```

---

<a name="proxies_port_set_post"/>

#### `/proxies/:port/set` (`POST`)
Updates or creates an arbitrary route for proxy on given port with source `domain`
and target `host` and `port` provided in `POST`. Routes created like this will be re-loaded when Ishiki restarts

##### Call example
```bash
curl -X POST -H 'Content-Type: application/json' -d '{"port": "12500","host": "internal.ip","domain": "my.domain"}' <http|https>://<ishiki-ip>:<ishiki-port>/proxies/80/set?token=<my-token>
```

##### Response
```json
{"message":"Proxy route added: my.domain:80 > internal.ip:12500"}
```

---

<a name="proxies_port_delete_proxy_post"/>

#### `/proxies/:port/delete_proxy` (`POST`)
Stops and removes proxy and associated routes on given port

##### Call example
```bash
curl -X POST <http|https>://<ishiki-ip>:<ishiki-port>/proxies/1234/delete_proxy?token=<my-token>
```

##### Response
```json
{"message":"Proxy no longer running on 1234"}
```

---

<a name="proxies_port_delete_route_post"/>

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
curl -X POST -H 'Content-Type: application/json' -d '{"domain":"my.domain"}' <http|https>://<ishiki-ip>:<ishiki-port>/proxies/1234/delete_route?token=<my-token>
```

##### Response
```json
{"message":"Route deleted for my.domain on port 1234"}
```

---

<a name="proxies_port_user_get"/>

#### `/proxies/:port/:userid` (`GET`)
Returns all routes for given user for proxy on given port

##### Call example
```bash
curl -X GET <http|https>://<ishiki-ip>:<ishiki-port>/proxies/80/user1?token=<my-token>
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

<a name="proxies_port_user_app_get"/>

#### `/proxies/:port/:userid/:appid` (`GET`)
Returns all routes for given user/app for proxy on given port

##### Call example
```bash
curl -X GET <http|https>://<ishiki-ip>:<ishiki-port>/proxies/80/user1/site1?token=<my-token>
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

<a name="proxies_port_user_app_delete_post"/>

#### `/proxies/:port/:userid/:appid/delete` (`POST`)
Deletes route for given user/app for proxy on given port

##### Call example
```bash
curl -X POST <http|https>://<ishiki-ip>:<ishiki-port>/proxies/80/user1/site1/delete?token=<my-token>
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
* [haibu (0.10.1)](https://github.com/nodejitsu/haibu/tree/v0.10.1)
* [semver (1.1.2)](https://github.com/isaacs/node-semver/tree/v1.1.2)
* [tar (0.1.17)](https://github.com/isaacs/node-tar/tree/v0.1.17)
* [http-proxy (0.10.2)](https://github.com/nodejitsu/node-http-proxy/tree/v0.10.2)
* [mongodb (1.2.x)](https://github.com/mongodb/node-mongodb-native/tree/V1.2.14)
* [bcrypt (0.7.x)](https://github.com/ncb000gt/node.bcrypt.js/tree/0.7.5)

## Requirements

* Node 0.8.x
* MongoDB database
* root access (or sufficient rights) to run `configure && make && make install` to install Node versions

## To Do

* [~~drone start/stop/restart API~~](https://github.com/grownseed/haibu-ishiki/commit/d889e89cb9d1fe225055d88c03a535223f9944c2)
* [~~automatically restart drones on server start~~](https://github.com/grownseed/haibu-ishiki/commit/0c17c1ca8c8f84bd536176d33955118260ace4ea)
* [~~add user authentication and permissions~~](https://github.com/grownseed/haibu-ishiki/commit/029598bdf23a6f7091c6beb3a7a7c8eabbb5e164)
* [~~allow for persistent proxy routes~~](https://github.com/grownseed/haibu-ishiki/commit/b054cdb4e9bb9d9b0f95aa6a2acc3e66889f588e)
* [~~user/app logs~~](https://github.com/grownseed/haibu-ishiki/commit/51145635d06fa6b78e4bd739d1c67e2612f65bb7) and [~~log streaming~~](https://github.com/grownseed/haibu-ishiki/commit/ed1a7d6f76c7a3974be7d6fb0fe7f18b9f73a78c)
* tighten security for each user/drone
* [~~create an easy-to-use client NPM module to work with Ishiki~~](https://github.com/grownseed/hachi)
* create a client interface for the browser

## License

[MIT License](https://github.com/grownseed/haibu-ishiki/blob/master/LICENSE)