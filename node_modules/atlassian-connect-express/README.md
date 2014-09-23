# atlassian-connect-express: Node.js package for Express based Atlassian Add-ons

[![Build Status](https://drone.io/bitbucket.org/atlassian/atlassian-connect-express/status.png)](https://drone.io/bitbucket.org/atlassian/atlassian-connect-express/latest)

`atlassian-connect-express` is a toolkit for creating [Atlassian Connect](https://developer.atlassian.com/display/AC/Atlassian+Connect) based Add-ons with [Node.js](http://nodejs.org/). Atlassian Connect is a distributed component model for creating Atlassian add-ons. Add-ons built with Atlassian Connect extend Atlassian applications over standard web protocols and APIs.

## More about `atlassian-connect-express`

The `atlassian-connect-express` package helps you get started developing add-ons quickly, using Node.js and Express as the add-on server.

It's important to understand that [Express](http://expressjs.com/) by itself is a web app framework for Node. `atlassian-connect-express` just provides a library of middleware and convenience helpers that make it easier to build Atlassian add-ons. Specifically, `atlassian-connect-express` adds:

* An optimized dev loop by handling registration and deregistration on the target Atlassian application for you at startup and shutdown
* A filesystem watcher that detects changes to `atlassian-connect.json`. When changes are detected, the add-on is re-registered with the host(s)
* Automatic JWT authentication of inbound requests as well as JWT signing for outbound requests back to the host
* Automatic persistence of host details (i.e., client key, host public key, host base url, etc.)
* Localtunnel'd server for testing with OnDemand instances

## Getting Started

The fastest way to get started is to install the `atlas-connect` CLI tool. The CLI makes it possible to generate a `atlassian-connect-express` enabled add-on scaffold very quickly. To install:

    npm i -g atlas-connect

### Create a project

Let's start by creating an add-on project:

    atlas-connect new <project_name>

This creates a new project home directory with the following contents:

    .
    ├── Procfile
    ├── README.md
    ├── app.js
    ├── atlassian-connect.json
    ├── config.json
    ├── package.json
    ├── private-key.pem
    ├── public
    │   ├── css
    │   │   └── addon.css
    │   └── js
    │       └── addon.js
    ├── public-key.pem
    ├── routes
    │   └── index.js
    └── views
        ├── hello-world.hbs
        └── layout.hbs

### Install dependencies

Change to the new project directory and install dependencies:

    npm install

`atlassian-connect-express` requires Node.js v0.10.12 or greater to run.

### Setting up a development environment

At this point, you're all set to run your add-on, but you still need the target application (i.e., JIRA or Confluence)
for your add-on. You have a few options:

1. You can do all your development work locally using the [Atlassian SDK](https://marketplace.atlassian.com/search?q=%22atlassian+plugin+sdk%22).
You can start a local instance of JIRA or Confluence by reading the [guide to developing locally](https://developer.atlassian.com/static/connect/docs/developing/developing-locally.html).
2. Install the add-on in [an Atlassian OnDemand instance](https://developer.atlassian.com/static/connect/docs/developing/installing-in-ondemand.html).
for more information.

### Running your Add-on Server

If you've chosen the first option and have a local running instance of JIRA or Confluence, you're all set. Now all you
need to do to run your add-on inside your local JIRA or Confluence instance is:

    node app.js

This will boot up your Express server on the default port of 3000 and do the following:

* Register your add-on's `atlassian-connect.json` (at <http://localhost:3000/atlassian-connect.json>) with the host
* Start watching for changes to your `atlassian-connect.json`. If the file is modified, `atlassian-connect-express` will
re-register your add-on with the host.

The created project already contains a sample atlassian-connect.json file which adds a "Hello World" general page to
your local running JIRA or Confluence instance. To ensure that everything is working as expected, navigate to your local
running instance and check that a "Hello World" link is present in the application's header and displays a "Hello World"
page when clicked.

### The Dev Loop

At this point, you can start building your add-on. Changes to views load automatically, however, if you make changes to
any JavaScript, you need to restart Express. If you want your server to automatically restart when your JavaScript
changes, consider using [nodemon](https://npmjs.org/package/nodemon) or the like.

As you've noticed, `atlassian-connect-express` automatically registers your add-on with the target application when it's
started. Another nice feature is that it automatically de-registers it at shutdown `<ctrl-c>`.

### Configuration

The configuration for your add-on is done in two files:

* `./config.json` -- This file contains the configuration for each runtime environment your plugin runs in. The file has
comments to help you understand available settings.
* `./atlassian-connect.json` -- This file is a manifest of all the extension points your add-on uses. To see all of the
available extension point options, check out the modules sections of the [atlassian-connect documentation](https://developer.atlassian.com/static/connect/docs/).

#### config.json

The `./config.json` file contains all of the settings for the add-on server. This file is broken into environments.

    {
      // set to true if your app contains a errorHandler middleware
      // see http://expressjs.com/guide.html#error-handling
      "expressErrorHandling" : false
      // This is the default environment. To change your app to use
      // a different env, set NODE_ENV (http://expressjs.com/api.html#app.configure)
      "development": {

        // This is the port your Express server will listen on
        "port": 3000,

        // atlassian-connect-express currently integrates with JugglingDB for persistence
        // to store the host client information (i.e., client key, host public
        // key, etc). When no adapter is specified, it defaults to JugglingDB's
        // fallback memory storage.
        //
        // To specify a backend for JugglingDB other than "memory", set the
        // "type" value to one of Juggling's other supported types.  See
        // https://github.com/1602/jugglingdb for more information.
        //
        // To use your own storage adapter, add the key
        // "adapter" to the following configuration, and replace "type" and
        // "connection" with any values your adapter expects.  Then make sure
        // that you register your adapter factory with the following code in
        // app.js:
        //
        //   ac.store.register(adapterName, factoryFn)
        //
        // See atlassian-connect-express/lib/store/index.js and the default jugglingdb.js
        // files for code demonstrating how to write a conformant adapter.  The
        // default values are as follows:
        //
        //   "store": {
        //     "adapter": "jugglingdb",
        //     "type": "memory"
        //   },
        //
        // To instead configure, say, a PostgreSQL store, the following could be
        // used:
        //
        //   "store": {
        //     "adapter": "jugglingdb",
        //     "type": "postgres",
        //     "url": "postgres://localhost/my_addon_database"
        //   },
        //
        // You will also need an appropriate JugglingDB driver if you choose something
        // other than the default "type".  In the PostgreSQL case you'd need to
        // run the following command to add the proper support:
        //
        //   $ npm install -S jugglingdb-postgres

        // If you are running provided container like Heroku you should add the
        // appropriate dependency to your package.json  file:
        //  "dependencies": {
        //    "jugglingdb-postgres": "0.0.4"
        //  }
        //
        // Your add-on will be registered with the following hosts upon startup.
        // In order to take advantage of the automatic registration/deregistration,
        // you need to make sure that your express app calls `addon.register()`
        // (see app.js). Also, you don't need to specify the user/pwd in the URL
        // as in the examples below. If you don't provide a user/pwd, you will be
        // prompted the first time you start the server.
        "hosts": [
          "http://admin:admin@localhost:1990/confluence",
          "http://admin:admin@localhost:2990/jira"
        ]
      },

      // This is the production add-on configuration, which is enabled by setting
      // the NODE_ENV=production environment variable.
      "production": {
        // On a PaaS host like Heroku, the runtime environment will provide the
        // HTTP port to you via the PORT environement variable, so we configure
        // that to be honored here.
        "port": "$PORT",
        // This is the public URL to your production add-on.
        "localBaseUrl": "https://your-subdomain.herokuapp.com",
        "store": {
          // You won't want to use the memory store in production, or your install
          // registrations will be forgotten any time your app restarts.  Here
          // we tell atlassian-connect-express to use the PostgreSQL backend for the default
          // JugglingDB adapter.
          "type": "postgres",
          // Again, a PaaS host like Heroku will probably provide the db connection
          // URL to you through the environment, so we tell atlassian-connect-express to use that value.
          "url": "$DATABASE_URL"
        },

        // Make sure that your add-on can only be registered by the hosts on
        // these domains.
        "whitelist": [
          "*.jira-dev.com",
          "*.atlassian.net",
          "*.jira.com"
        ]
      }
    }

### atlassian-connect.json

The `atlassian-connect.json` describes what your add-on will do. There are three main parts to the descriptor: meta
information that describes your add-on (i.e., name, description, key, etc.), permissions and authentication information,
and a list of the components your add-on will extend. This descriptor is sent to the host (i.e., JIRA or Confluence)
when your add-on is installed.

To see all of the available settings in the `atlassian-connect.json`, visit the module sections of the
[atlassian-connect documentation](https://developer.atlassian.com/static/connect/docs/)

## Sample Add-ons using `atlassian-connect-express`

* [Sequence Diagramr](https://bitbucket.org/atlassianlabs/atlassian-connect-confluence-sequence-diagramr) -- a simple
Confluence remote macro for creating UML sequence diagrams
* [Confluence Word Cloud](https://bitbucket.org/atlassianlabs/atlassian-connect-confluence-word-cloud) -- a macro that
takes the contents of a page and constructs an SVG-based word cloud
* [Atlassian Connect Webhook Inspector](https://bitbucket.org/atlassianlabs/webhook-inspector) -- a simple tool to log
webhooks fired in Atlassian apps for development purposes.

## The `atlassian-connect-express` scaffold

When you generate a new `atlassian-connect-express` add-on, you're actually just downloading a copy of the
[Atlassian Connect Expressjs template](https://bitbucket.org/atlassian/atlassian-connect-express-template/).

### Handlebars layouts and templates

The base scaffold uses the [Handlebars](http://handlebarsjs.com) template library via the [express-hbs](https://github.com/barc/express-hbs) package.

Handlebars views are stored in the `./views` directory. The base template contains a `layout.hbs` and a sample page
(`hello-world.hbs`). Handlebars alone doesn't provide layouts, but the `express-hbs` package does. To apply the
`layout.hbs` layout to your template page, just add the following to the top of your template:

    {{!< layout}}

To learn more about how Handlebars works in express.js, take a look at the [express-hbs documentation](https://github.com/barc/express-hbs#readme).

### Special context variables

`atlassian-connect-express` injects a handful of useful context variables into your render context. You can access any
of these within your templates:

* `title`: the add-on's name (derived from `atlassian-connect.json`)
* `appKey`: the application key defined in `atlassian-connect.json`
* `localBaseUrl`: the base URI of the add-on
* `hostBaseUrl`: the base URI of the target application (includes the context path if available)
* `hostStylesheetUrl`: the URL to the base CSS file for Connect add-ons. This stylesheet is a bare minimum set of styles
to help you get started. It's not a full AUI stylesheet.
* `hostScriptUrl`: the URL to the Connect JS client. This JS file contains the code that will establish the seamless
iframe bridge between the add-on and its parent. It also contains a handful of methods and objects for accessing data
through the parent (look for the `AP` JS object).
* `token`: the token that can be used to authenticate calls from the iframe back to the add-on service.

You can access any of the variables above as normal Handlebars variables. For example, to generate a link in your page
that links elsewhere in the host:

    <a href="{{hostBaseUrl}}/browse/JRA">JIRA</a>

## Recipes

### How to secure a route with JWT

Add-ons are authenticated through JWT. To simplify JWT verification on your routes, you can simply add a
`atlassian-connect-express` middleware to your route:

    module.exports = function (app, addon) {
        app.get('/protected-resource',

            // Protect this resource with JWT
            addon.authenticate(),

            function(req, res) {
              res.render('protected');
            }
        );
    };

Simply adding the `addon.authenticate()` middleware will protect your resource.

### How to send a signed HTTP request from the iframe back to the add-on service

The initial call to load the iframe content is secured by JWT, as described above. However, the loaded content cannot
sign subsequent requests. A typical example is content that makes AJAX calls back to the add-on. Cookie sessions cannot
be used, as many browsers block third-party cookies by default. `atlassian-connect-express` provides middleware that
works without cookies and helps making secure requests from the iframe.

#### In ACE 1.0

Starting with ACE 1.0, standard JWT tokens are used to authenticate requests from the iframe back to the add-on
service. A route can be secured using the `addon.checkValidToken()` middleware:

    module.exports = function (app, addon) {
        app.get('/protected-resource',

            // Require a valid token to access this resource
            addon.checkValidToken(),

            function(req, res) {
              res.render('protected');
            }
        );
    };

In order to secure your route, the token must be part of the HTTP request back to the add-on service. This can be done
by using the standard `jwt` query parameter:

    <a href="/protected-resource?jwt={{token}}">See more</a>

The second option is to use the Authorization HTTP header, e.g. for AJAX requests:

    beforeSend: function (request) {
        request.setRequestHeader("Authorization", "JWT {{token}}");
    }

You can embed the token anywhere in your iframe content using the `token` content variable. For example, you can embed
it in a meta tag, from where it can later be read by a script:

    <meta name="token" content="{{token}}">
    
#### In ACE 0.9.x

A route can be secured by adding the `checkValidToken` middleware:

    module.exports = function (app, addon) {
        app.get('/protected-resource',

            // Require a valid token to access this resource
            addon.checkValidToken(),

            function(req, res) {
              res.render('protected');
            }
        );
    };

In order to secure your route, the token must be part of the HTTP request back to the add-on service. This can be done
by using a query parameter:

    <a href="/protected-resource?acpt={{token}}">See more</a>

The second option is to use an HTTP header, e.g. for AJAX requests:

    beforeSend: function (request) {
        request.setRequestHeader("X-acpt", {{token}});
    }

You can embed the token anywhere in your iframe content using the `token` content variable. For example, you can embed
it in a meta tag, from where it can later be read by a script:

    <meta name="acpt" content="{{token}}">

Both the query parameter `acpt` and the HTTP request header `X-acpt` are automatically recognized and handled by
`atlassian-connect-express` when a route is secured with the token middleware. The token remains valid for 15 minutes
by default, and is automatically refreshed on each call. The expiration of the token can be configured using
`maxTokenAge` (in seconds).


### How to send a signed outbound HTTP request back to the host

`atlassian-connect-express` bundles and extends the [request](https://github.com/mikeal/request) HTTP client. To make a
JWT signed request back to the host, all you have to do is use `request` the way it was designed, but use a relative
path as your URL back to the host's REST APIs. If `request` finds that you're using a relative URL, it will get signed.
If you use an absolute URL, it bypasses signing.

    var httpClient = addon.httpClient(req);
    httpClient.get('/', function(err, res, body){
      ...
    });

If not in a request context, you can perform the equivalent operation as follows:

    var httpClient = addon.httpClient({
      clientKey: clientKey, // the unique client key of the tenant to make a request to
      userId: userId,
      appKey: appKey
    });
    httpClient.get('/', function(err, res, body){
      ...
    });

You can also set custom headers or send a form data. Take, for example this request which attaches a file to a JIRA issue
    
    var filePath = path.join(__dirname, 'some.png');
    fs.readFile(filePath, function (err, data) {
        httpClient.post({
            url: '/rest/api/2/issue/' + issueKey + '/attachments',
            headers: {
                'X-Atlassian-Token': 'nocheck'
            },
            multipartFormData: {
                file: [data, { filename: 'some.png' }]
            }
        },
        function (err, httpResponse, body) {
            if (err) {
                return console.error('Upload failed:', err);
            }
            console.log('Upload successful:', body);
        });
    });

### Using the product REST API

Certain REST URLs may require [additional scopes](https://developer.atlassian.com/static/connect/docs/scopes/scopes.html)
 that should be added to your `atlassian-connect.json` file.


### How to deploy to Heroku
Before you start, install Git and the [Heroku Toolbelt](https://toolbelt.heroku.com/).

If you aren't using git to track your add-on, now is a good time to do so as it is required for Heroku. Ensure you are
in your project home directory and run the following commands:

	git config --global user.name "John Doe"
	git config --global user.email johndoe@example.com
	ssh-keygen -t rsa
	git init
	git add .
	git commit . -m "some message"
	heroku keys:add

Next, create the app on Heroku:

    heroku apps:create <add-on-name>

Then set the public and private key as environment variables in Heroku (you don't ever want to commit these `*.pem`
files into your scm). The two `.*pem` files were created in your project home directory when you ran the `atlas-connect new` command.

    heroku config:set AC_PUBLIC_KEY="`cat public-key.pem`" --app <add-on-name>
    heroku config:set AC_PRIVATE_KEY="`cat private-key.pem`" --app <add-on-name>

We recommend that you don't use the automatically generated key pair in production. You can use any RSA key pair
generation tool such as [JSEncrypt](http://travistidwell.com/jsencrypt/demo/) to generate a production key pair.

Next, let's store our registration information in a Postgres database. In development, you were likely using the memory
store. In production, you'll want to use a real database.

    heroku addons:add heroku-postgresql:dev --app <add-on-name>

Lastly, let's add the project files to Heroku and deploy!

If you aren't already there, switch to your project home directory. From there, run these commands:

    git remote add heroku git@heroku.com:<add-on-name>.git
    git push heroku master

It will take a minute or two for Heroku to spin up your add-on. When it's done, you'll be given the URL where your
 add-on is deployed, however, you'll still need to register it on your Atlassian instance.

If you're running an OnDemand instance of JIRA or Confluence locally, you can install it from the add-on administration
console. See complete [getting started guide](https://developer.atlassian.com/static/connect/docs/guides/getting-started.html)
for more information.

In order to run your add-on on remote JIRA and Confluence instances, you must enter production mode. To achieve this,
set the `NODE_ENV` variable to production like so:

    heroku config:set NODE_ENV=production

For further detail, we recommend reading [Getting Started with Node.js on Heroku](https://devcenter.heroku.com/articles/getting-started-with-nodejs).

Before installing remotely on your product instance, create a marketplace listing for your add-on, generate an access
token, and install it - [as described here](https://developer.atlassian.com/static/connect/docs/developing/installing-in-ondemand.html).

## Troubleshooting

### "Unable to connect and retrieve descriptor from http://localhost:3000/atlassian-connect.json, message is: java.net.ConnectException: Connection refused"

You'll get this error if JIRA or Confluence can't access `http://localhost:3000/atlassian-connect.json`.
One way to debug this is to see what `hostname` returns:

    $ hostname

If it returns `localhost`, change it. On a OS X, you'll need to set a proper "Computer Name" in System Preferences > Sharing.

### Debugging HTTP Traffic

Several tools exist to help snoop the HTTP traffic between your add-on and the host server:

* Enable node-request's HTTP logging by starting your app with `NODE_DEBUG=request node app`
* Check out the HTTP-debugging proxies [Charles](http://www.charlesproxy.com/) and [Fiddler](http://fiddler2.com/)
* Try local TCP sniffing with [justniffer](http://justniffer.sourceforge.net/) by running something like
`justniffer -i eth0 -r`, substituting the correct interface value

## Getting Help or Support

You can get help by emailing <atlassian-connect-dev@googlegroups.com> or report bugs on our
[JIRA](https://ecosystem.atlassian.net/browse/AC). If you want to learn more about Atlassian Connect, you can visit
<https://developer.atlassian.com/static/connect/docs>.

## Contributing

Even though this is just an exploratory project at this point, it's also open source
[Apache 2.0](https://bitbucket.org/atlassian/atlassian-connect-express/src/master/LICENSE.txt). So, please feel free
to fork and send us pull requests.

## Unit tests in `atlassian-connect-express`

Run `mocha test`.
