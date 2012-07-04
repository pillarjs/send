
/**
 * Module dependencies.
 */

var connect = require('connect');

connect()
  .use(connect.static(__dirname + '/public'))
  .listen(3000);
