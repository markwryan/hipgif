var http = require('request');
var giphyAPIKey = addon.config.giphyAPIKey() || "dc6zaTOxFJmzC";
var giphyAPI = "http://api.giphy.com/v1/gifs/translate?s=[QUERY]&api_key=" + giphyAPIKey + "&limit=1&rating=pg"

module.exports = function (app, addon) {
  var hipchat = require('../lib/hipchat')(addon);

  // Root route. This route will serve the `addon.json` unless a homepage URL is
  // specified in `addon.json`.
  app.get('/',
    function(req, res) {
      // Use content-type negotiation to choose the best way to respond
      res.format({
        // If the request content-type is text-html, it will decide which to serve up
        'text/html': function () {
          res.redirect(addon.descriptor.links.homepage);
        },
        // This logic is here to make sure that the `addon.json` is always
        // served up when requested by the host
        'application/json': function () {
          res.redirect('/atlassian-connect.json');
        }
      });
    }
  );

  // This is an example route that's used by the default for the configuration page
  app.get('/config',
    // Authenticates the request using the JWT token in the request
    addon.authenticate(),
    function(req, res) {
      // The `addon.authenticate()` middleware populates the following:
      // * req.clientInfo: useful information about the add-on client such as the
      //   clientKey, oauth info, and HipChat account info
      // * req.context: contains the context data accompanying the request like
      //   the roomId
      res.render('config', req.context);
    }
  );

  // This is an example route to handle an incoming webhook
  app.post('/webhook',
    addon.authenticate(),
    function(req, res) {
        var message = req.context.item.message.message;
        message = message.replace(/\/gif/g, '').trim();
        encodedMessage = message.replace(/\W+/g, "+");
        var gifUrl = giphyAPI.replace("[QUERY]", encodedMessage);
        var opts = {};
        opts.color = 'green';
        opts.options = true;
        
        http(gifUrl, function (error, response, body) {
          if (!error && response.statusCode == 200) {
              var json = JSON.parse(body);
			  if(typeof json.data.images !== 'undefined') {
	              var imageUrl = "#" + message + " Powered By Giphy" ++ " " + json.data.images.downsized.url;
	              hipchat.sendMessage(req.clientInfo, req.context.item.room.id, imageUrl, opts)
	                .then(function(data){
	                  res.send(200);
	                });
			  } else {
	              hipchat.sendMessage(req.clientInfo, req.context.item.room.id, "Having trouble finding a GIF. Try again in a few minutes.", opts)
	                .then(function(data){
	                  res.send(200);
                  });
			  }
              
          }
        })
        
    }
     
  );

  // Notify the room that the add-on was installed
  addon.on('installed', function(clientKey, clientInfo, req){
    hipchat.sendMessage(clientInfo, req.body.roomId, 'The ' + addon.descriptor.name + ' add-on has been installed in this room');
  });

  // Clean up clients when uninstalled
  addon.on('uninstalled', function(id){
    addon.settings.client.keys(id+':*', function(err, rep){
      rep.forEach(function(k){
        addon.logger.info('Removing key:', k);
        addon.settings.client.del(k);
      });
    });
  });

};
