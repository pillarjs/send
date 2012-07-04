
/**
 * Module dependencies.
 */

var send = require('..')
  , http = require('http');

http.createServer(function(req, res){
  send(req.url)
  .from(__dirname + '/public')
  .pipe(res);
}).listen(3000);