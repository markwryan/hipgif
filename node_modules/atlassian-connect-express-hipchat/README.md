# atlassian-connect-express-hipchat: Node.js module for Express based HipChat Connect Add-ons

[![Build Status](https://drone.io/bitbucket.org/hipchat/atlassian-connect-express-hipchat/status.png)](https://drone.io/bitbucket.org/hipchat/atlassian-connect-express-hipchat/latest)

`atlassian-connect-express-hipchat` is an NPM module for creating [HipChat Connect](https://www.hipchat.com/docs/apiv2/addons) Add-ons with [Node.js](http://nodejs.org/). HipChat Connect is a variant of [Atlassian Connect](https://developer.atlassian.com/static/connect/docs/) and `atlassian-connect-express-hipchat` is a HipChat compatibility layer on top of [atlassian-connect-express](https://bitbucket.org/atlassian/atlassian-connect-express) (aka, ACE).

## More about `atlassian-connect-express-hipchat`

The `atlassian-connect-express-hipchat` package helps you get started developing add-ons quickly, using Node.js and Express as the add-on server.  

It's important to understand that [Express](http://expressjs.com/) by itself is a web app framework for Node. `atlassian-connect-express-hipchat` just provides a library of middleware and convenience helpers that make it easier to build HipChat add-ons. Specifically, `atlassian-connect-express-hipchat` adds:

* Automatic JWT authentication of inbound requests
* Automatic persistence of host details (i.e., client information)
* HipChat client for communicating with the HipChat REST API

## Getting Started

The fastest way to get started is to install the `atlas-connect` CLI tool. The CLI makes it possible to generate a `atlassian-connect-express-hipchat` enabled add-on scaffold very quickly. To install:

    npm i -g atlas-connect

### Create a project

Let's start by creating an add-on project:

    atlas-connect new -t hipchat <project_name>

This creates a new project home directory with the following contents:

    .
    ├── Procfile
    ├── README.md
    ├── app.js
    ├── atlassian-connect.json
    ├── config.json
    ├── lib
    │   └── hipchat.js
    ├── package.json
    ├── public
    │   ├── css
    │   │   └── addon.css
    │   └── js
    │       └── addon.js
    ├── routes
    │   └── index.js
    └── views
        ├── config.hbs
        └── layout.hbs

### Install dependencies

Change to the new project directory and install dependencies:

    npm install

### Setting up a development environment

The development workflow for building HipChat add-ons is rad. You can build your add-on locally while running it inside of <https://hipchat.com>. To do this, you'll need to expose your local webserver to the internet. An easy way to do this is to use a [local tunnel](http://en.wikipedia.org/wiki/Tunneling_protocol). We highly recommend using [ngrok](https://ngrok.com/). `ngrok` is a simple client tool that allows you to forward internet requests on an ngrok subdomain to your local server:

    ngrok -subdomain <subdomain-name> <port>

### Running your Add-on Server

Once you've started your tunnel, you can run your add-on server:

    AC_LOCAL_BASE_URL=https://<subdomain>.ngrok.com node app.js

This will boot up your add-on server on the default port of 3000. The `AC_LOCAL_BASE_URL` environment variable tells your add-on to use the specified base URL instead of <http://localhost:3000>.

### The Dev Loop

At this point, you can start building your add-on. Changes to views load automatically, however, if you make changes to any JavaScript, you need to restart your add-on server. If you want your server to automatically restart when your JavaScript changes, consider using [nodemon](https://npmjs.org/package/nodemon).

    AC_LOCAL_BASE_URL=https://<subdomain>.ngrok.com nodemon app.js

### Registering your Add-on with HipChat

To get your add-on into HipChat, you have to register your addon's `atlassian-connect.json` descriptor. This descriptor will be accessible through:

    https://<subdomain>.ngrok.com/atlassian-connect.json

HipChat add-ons can operate inside a room or within the entire account. When developing, you should probably register your add-on inside a room you've created just for testing. Also, you can only register add-ons inside a room where you are an administrator.

To register your add-on descriptor, navigate to the rooms administration page:

    https://<your-account>.hipchat.com/rooms

Then select one of your rooms in the list. In the following page, select `Add-ons` in the sidebar:

![Add-on administration](http://f.cl.ly/items/1w2S2z2c3g0k031x3S1d/HipChat%20-%20HipChat%20Add-ons%202014-02-11%2010-32-48.png)

Below the page, you'll find the **Create new private add-ons** form. Paste your descriptor URL in the **Capabilities URL** field then save. This will initiate the installation of your add-on inside the room.

### Configuration

The configuration for your add-on is done in two files:

* `./config.json` -- This file contains the configuration for each runtime environment your add-on runs in. The file has comments to help you understand available settings.
* `./atlassian-connect.json` -- This file is a manifest of all the extension points your add-on uses. To see all of the available extension point options, take a look at the [HipChat Add-on Capabilities page](https://www.hipchat.com/docs/apiv2/method/get_capabilities).

#### config.json

The `./config.json` file contains all of the settings for the add-on server. This file is divided into runtime environments. The default template includes `development` and `production`, but you're free to add any other environments you'd like to use.

To run your add-on in a specific environment, use the `NODE_ENV` environment variable:

    NODE_ENV=<environment> AC_LOCAL_BASE_URL=https://<subdomain>.ngrok.com nodemon app.js


### atlassian-connect.json

The `atlassian-connect.json` describes what your add-on will do. There are two main parts to the descriptor: meta information that describes your add-on (i.e., name, description, key, etc.) and a list of the modules your add-on will provide. This descriptor is registered with HipChat when your add-on is installed.

To see all of the available settings in the `atlassian-connect.json`, take a look at the [HipChat Add-on Capabilities page](https://www.hipchat.com/docs/apiv2/method/get_capabilities).

## Sample Add-ons using `atlassian-connect-express-hipchat`

* [GitHub](https://bitbucket.org/hipchat/hipchat-github-addon) -- get notified of events that happen on GitHub inside your HipChat rooms
* [Instagram](https://bitbucket.org/hipchat/hipchat-instagram-addon) -- get room notifications when someone posts a photo matching a tag you're watching
* [Chatty](https://bitbucket.org/hipchat/chatty) -- Chatty is a HipChat add-on that aims to replace [hubot-hipchat](https://github.com/hipchat/hubot-hipchat). Since the `hubot-hipchat` adapter has proven difficult to maintain and set up, this attempts to provide much of the same functionality using HipChat's add-on system.

## The `atlassian-connect-express-hipchat` scaffold

When you generate a new `atlassian-connect-express-hipchat` add-on, you're actually just downloading a copy of the [Atlassian Connect Expressjs template](https://bitbucket.org/atlassian/atlassian-connect-express-template/src/hipchat/).

### Handlebars layouts and templates

The base scaffold uses the [Handlebars](http://handlebarsjs.com) template library via the [express-hbs](https://github.com/barc/express-hbs) package.

Handlebars views are stored in the `./views` directory. The base template contains a `layout.hbs` and a configuration page (`config.hbs`). Handlebars alone doesn't provide layouts, but the `express-hbs` package does. To apply the `layout.hbs` layout to your template page, just add the following to the top of your template:

    {{!< layout}}

To learn more about how Handlebars works in Expressjs, take a look at the [express-hbs documentation](https://github.com/barc/express-hbs#readme).

### Special context variables

`atlassian-connect-express-hipchat` injects a handful of useful context variables into your render context. You can access any of these within your templates:

* `title`: the add-on's name (derived from `atlassian-connect.json`)
* `appKey`: the application key defined in `atlassian-connect.json`
* `localBaseUrl`: the base URI of the add-on
* `hostStylesheetUrl`: the URL to the base CSS file for Connect add-ons. This stylesheet is a bare minimum set of styles to help you get started. It's not a full AUI stylesheet.
* `hostScriptUrl`: the URL to the Connect JS client. This JS file contains the code that will establish the seamless iframe bridge between the add-on and its parent. It also contains a handful of methods and objects for accessing data through the parent (look for the `AP` JS object).
* `signed_request`: a JWT token that can be used to authenticate calls from the iframe back to the add-on service.

You can access any of the variables above as normal Handlebars variables. For example, to generate a link in your page that links elsewhere in the host:

    <a href="{{hostBaseUrl}}/config">Configuration</a>

## Recipes

### How to secure a route with JWT

Add-ons are authenticated through [JWT](http://tools.ietf.org/html/draft-ietf-oauth-json-web-token-15). To simplify JWT verification on your routes, you can simply add a `atlassian-connect-express-hipchat` middleware to your route:

    module.exports = function (app, addon) {
        app.get('/protected-resource',

            // Protect this resource with JWT
            addon.authenticate(),

            function(req, res) {
              res.render('protected');
            }
        );
    };

Simply adding the `addon.authenticate()` middleware will protect your resource. It will also make available some useful `request` properties that will be useful in your app:

* `req.clientInfo`: useful information about the add-on client such as the clientKey, oauth info, and HipChat account info
* `req.context`: contains the context data accompanying the request like the roomId

It also populates the `res.signed_request` property that can be used to expose the JWT token to your pages for subsequent requests back to your add-on server.

### How to send a signed HTTP request from the iframe back to the add-on service

The initial call to load the iframe content is secured by JWT, as described above. However, the loaded content cannot sign subsequent requests. A typical example is content that makes AJAX calls back to the add-on. Cookie sessions cannot be used, as many browsers block third-party cookies by default. `atlassian-connect-express-hipchat` provides middleware that works without cookies and helps making secure requests from the iframe.

A route can be secured by adding the `addon.authenticate()` middleware:

    module.exports = function (app, addon) {
        app.get('/protected-resource',

            // Require a valid token to access this resource
            addon.authenticate(),

            function(req, res) {
              res.render('protected');
            }
        );
    };

In order to secure your route, the token must be part of the HTTP request back to the add-on service. This can be done by using a query parameter:

    <a href="/protected-resource?signed_request={{signed_request}}">See more</a>

The second option is to use an HTTP header, e.g. for AJAX requests:

    beforeSend: function (request) {
        request.setRequestHeader("X-acpt", {{token}});
    }

You can embed the token anywhere in your iframe content using the `token` content variable. For example, you can embed it in a meta tag, from where it can later be read by a script:

    <meta name="acpt" content="{{signed_request}}">

Both the query parameter `acpt` and the HTTP request header `X-acpt` are automatically recognized and handled by `atlassian-connect-express-hipchat` when a route is secured with the `addon.authenticate()` middleware. The token remains valid for 15 minutes by default, and is automatically refreshed on each call. The expiration of the token can be configured using `maxTokenAge` (in seconds) inside `config.json`.

### How to send a signed outbound HTTP request back to the host

`atlassian-connect-express-hipchat` bundles and extends the [request](https://github.com/mikeal/request) HTTP client. To make a request back to the HipChat, all you have to do is use `request` the way it was designed. REST calls back to HipChat require that you use the `access_token` provided to you at installation.

To make things easier, we've provided a simple HipChat client for sending messages found inside `./lib/hipchat.js`. To use this, all you have to do is:

    var hipchat = require('../lib/hipchat')(addon);
    
    // This is an example route to handle an incoming webhook
    app.post('/webhook',
        addon.authenticate(),
        function(req, res) {
          hipchat.sendMessage(req.clientInfo, req.context.item.room.id, 'pong')
            .then(function(data){
              res.send(200);
            });
        }
    );

### How to persist data for your add-on

`atlassian-connect-express-hipchat` bundles a [Redis](http://redis.io/) [adapter](https://bitbucket.org/atlassianlabs/atlassian-connect-express-redis). *To use Redis with your add-on, you should install Redis locally.*

You don't have to use Redis, but the default template makes use of Redis. Redis is awesome for building add-ons, but you're free to use whatever you'd like. We also bundle [JugglingDB](http://jugglingdb.co/) (a cross-database ORM for nodejs) which works with a variety of databases.

If you choose to use Redis, congratulations on *doing the right thing*. But more importantly, you might also want to use [redis-commander](https://github.com/joeferner/redis-commander) to manage your Redis data. It's extremely helpful to see what's getting stored in your DB.

### How to deploy to Heroku
Before you start, install Git and the [Heroku Toolbelt](https://toolbelt.heroku.com/).

If you aren't using git to track your add-on, now is a good time to do so as it is required for Heroku. Ensure you are in your project home directory and run the following commands:

    git config --global user.name "John Doe"
    git config --global user.email johndoe@example.com
    ssh-keygen -t rsa
    git init
    git add .
    git commit . -m "some message"
    heroku keys:add

Next, create the app on Heroku:

    heroku apps:create <add-on-name>

Then set the public and private key as environment variables in Heroku (you don't ever want to commit these `*.pem` files into your scm). The two `.*pem` files were created in your project home directory when you ran the `atlas-connect new` command. 

    heroku config:set AC_LOCAL_BASE_URL=https://<subdomain> herokuapp.com --app <add-on-name>
    heroku config:set DATABASE_URL=<DB URL> --app <add-on-name>

Lastly, let's add the project files to Heroku and deploy! 

If you aren't already there, switch to your project home directory. From there, run these commands:

    git remote add heroku git@heroku.com:<add-on-name>.git
    git push heroku master

It will take a minute or two for Heroku to spin up your add-on. When it's done, you'll be given the URL where your add-on is deployed, however, you'll still need to register the `atlassian-connect.json` descriptor on HipChat.

For further detail, we recommend reading [Getting Started with Node.js on Heroku](https://devcenter.heroku.com/articles/getting-started-with-nodejs).

## Troubleshooting

### Debugging HTTP Traffic

If you're using `ngrok`, you can point your browser to <http://localhost:4040> to access `ngrok`'s built-in traffic analyzer.

## Getting Help or Support

You can get help by emailing <atlassian-connect-dev@googlegroups.com> or [report bugs](https://bitbucket.org/hipchat/atlassian-connect-express-hipchat/issues?status=new&status=open). If you want to learn more about HipChat Connect, you can visit <https://www.hipchat.com/docs/apiv2/addons>.

## Contributing

Even though this is just an exploratory project at this point, it's also open source [Apache 2.0](https://bitbucket.org/atlassian/atlassian-connect-express-hipchat/src/master/LICENSE.txt). So, please feel free to fork and send us pull requests.
