# send

[![NPM version](https://badge.fury.io/js/send.svg)](https://badge.fury.io/js/send)
[![Build Status](https://travis-ci.org/visionmedia/send.svg?branch=master)](https://travis-ci.org/visionmedia/send)
[![Coverage Status](https://img.shields.io/coveralls/visionmedia/send.svg?branch=master)](https://coveralls.io/r/visionmedia/send)

Send is a library for streaming files from the file system as a http response
supporting partial responses (Ranges), conditional-GET negotiation, high test
coverage, and granular events which may be leveraged to take appropriate actions
in your application or framework.

Looking to serve up entire folders mapped to URLs? Try [serve-static](https://www.npmjs.org/package/serve-static#readme).

## Installation

```sh
$ npm install send
```

## API

```js
var send = require('send')
```

### send(req, path, [options])

Create a `SendStream` for the given `req` and `path`. `req` is the
incoming HTTP request, which is used to provide conditional GET and
range requests. `path` is the file system path to send. If `path`
refers to a directory instead of a file, an "index" file is searched
for within the directory and sent (see `options.index`).

#### options.etag

Enable or disable etag generation, defaults to true.

#### options.hidden

Enable or disable transfer of hidden files, defaults to false.

#### options.index

By default send supports "index.html" files, to disable this
set `false` or to supply a new index pass a string or an array
in preferred order.

#### options.maxAge

Provide a max-age in milliseconds for http caching, defaults to 0.
This can also be a string accepted by the
[ms](https://www.npmjs.org/package/ms#readme) module.

#### options.root

Serve files relative to `path`.

### Events

  - `error` an error occurred `(err)`
  - `directory` a directory was requested
  - `file` a file was requested `(path, stat)`
  - `headers` the headers are about to be set on a file `(res, path, stat)`
  - `stream` file streaming has started `(stream)`
  - `end` streaming has completed

## Error-handling

  By default when no `error` listeners are present an automatic response will be made, otherwise you have full control over the response, aka you may show a 5xx page etc.

## Caching

  It does _not_ perform internal caching, you should use a reverse proxy cache such
  as Varnish for this, or those fancy things called CDNs. If your application is small enough that it would benefit from single-node memory caching, it's small enough that it does not need caching at all ;).

## Debugging

 To enable `debug()` instrumentation output export __DEBUG__:

```sh
$ DEBUG=send node app
```

## Examples

```js
var http = require('http');
var send = require('send');

var server = http.createServer(function(req, res){
  send(req, 'cat_video.mp4').pipe(res);
});

server.listen(3000);
```

## Running tests

```sh
$ npm install
$ npm test
```

## License 

(The MIT License)

Copyright (c) 2012 TJ Holowaychuk &lt;tj@vision-media.ca&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
