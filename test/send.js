
var assert = require('assert');
var fs = require('fs');
var http = require('http');
var path = require('path');
var request = require('supertest');
var send = require('..')
var should = require('should');

// test server

var fixtures = path.join(__dirname, 'fixtures');
var app = http.createServer(function(req, res){
  function error(err) {
    res.statusCode = err.status;
    res.end(http.STATUS_CODES[err.status]);
  }

  function redirect() {
    res.statusCode = 301;
    res.setHeader('Location', req.url + '/');
    res.end('Redirecting to ' + req.url + '/');
  }

  send(req, req.url, {root: fixtures})
  .on('error', error)
  .on('directory', redirect)
  .pipe(res);
});

describe('send.mime', function(){
  it('should be exposed', function(){
    assert(send.mime);
  })
})

describe('send(file).pipe(res)', function(){
  it('should stream the file contents', function(done){
    request(app)
    .get('/name.txt')
    .expect('Content-Length', '4')
    .expect(200, 'tobi', done)
  })

  it('should decode the given path as a URI', function(done){
    request(app)
    .get('/some%20thing.txt')
    .expect(200, 'hey', done)
  })

  it('should serve files with dots in name', function(done){
    request(app)
    .get('/do..ts.txt')
    .expect(200, '...', done)
  })

  it('should treat a malformed URI as a bad request', function(done){
    request(app)
    .get('/some%99thing.txt')
    .expect(400, 'Bad Request', done)
  })

  it('should 400 on NULL bytes', function(done){
    request(app)
    .get('/some%00thing.txt')
    .expect(400, 'Bad Request', done)
  })

  it('should treat an ENAMETOOLONG as a 404', function(done){
    var path = Array(100).join('foobar');
    request(app)
    .get('/' + path)
    .expect(404, done);
  })

  it('should handle headers already sent error', function(done){
    var app = http.createServer(function(req, res){
      res.write('0');
      send(req, req.url, {root: fixtures})
      .on('error', function(err){ res.end(' - ' + err.message) })
      .pipe(res);
    });
    request(app)
    .get('/nums')
    .expect(200, '0 - Can\'t set headers after they are sent.', done);
  })

  it('should support HEAD', function(done){
    request(app)
    .head('/name.txt')
    .expect('Content-Length', '4')
    .expect(200, '', done)
  })

  it('should add an ETag header field', function(done){
    request(app)
    .get('/name.txt')
    .expect('etag', /^W\/"[^"]+"$/)
    .end(done);
  })

  it('should add a Date header field', function(done){
    request(app)
    .get('/name.txt')
    .expect('date', /^\w{3}, \d+ \w+ \d+ \d+:\d+:\d+ \w+$/, done)
  })

  it('should add a Last-Modified header field', function(done){
    request(app)
    .get('/name.txt')
    .expect('last-modified', /^\w{3}, \d+ \w+ \d+ \d+:\d+:\d+ \w+$/, done)
  })

  it('should add a Accept-Ranges header field', function(done){
    request(app)
    .get('/name.txt')
    .expect('Accept-Ranges', 'bytes', done)
  })

  it('should 404 if the file does not exist', function(done){
    request(app)
    .get('/meow')
    .expect(404, 'Not Found', done)
  })

  it('should 301 if the directory exists', function(done){
    request(app)
    .get('/pets')
    .expect('Location', '/pets/')
    .expect(301, 'Redirecting to /pets/', done)
  })

  it('should not override content-type', function(done){
    var app = http.createServer(function(req, res){
      res.setHeader('Content-Type', 'application/x-custom')
      send(req, req.url, {root: fixtures}).pipe(res)
    });
    request(app)
    .get('/nums')
    .expect('Content-Type', 'application/x-custom', done);
  })

  it('should set Content-Type via mime map', function(done){
    request(app)
    .get('/name.txt')
    .expect('Content-Type', 'text/plain; charset=UTF-8')
    .expect(200, function(err){
      if (err) return done(err)
      request(app)
      .get('/tobi.html')
      .expect('Content-Type', 'text/html; charset=UTF-8')
      .expect(200, done)
    });
  })

  it('should 404 if file disappears after stat, before open', function(done){
    var app = http.createServer(function(req, res){
      send(req, req.url, {root: 'test/fixtures'})
      .on('file', function(){
        // simulate file ENOENT after on open, after stat
        var fn = this.send;
        this.send = function(path, stat){
          path += '__xxx_no_exist';
          fn.call(this, path, stat);
        };
      })
      .pipe(res);
    });

    request(app)
    .get('/name.txt')
    .expect(404, done);
  })

  it('should 500 on file stream error', function(done){
    var app = http.createServer(function(req, res){
      send(req, req.url, {root: 'test/fixtures'})
      .on('stream', function(stream){
        // simulate file error
        process.nextTick(function(){
          stream.emit('error', new Error('boom!'));
        });
      })
      .pipe(res);
    });

    request(app)
    .get('/name.txt')
    .expect(500, done);
  })

  describe('when no "directory" listeners are present', function(){
    var server
    before(function(){
      server = http.createServer(function(req, res){
        send(req, req.url, {root: 'test/fixtures'})
        .pipe(res)
      })
    })

    it('should respond with an HTML redirect', function(done){
      request(server)
      .get('/pets')
      .expect('Location', '/pets/')
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(301, 'Redirecting to <a href="/pets/">/pets/</a>\n', done)
    })
  })

  describe('when no "error" listeners are present', function(){
    it('should respond to errors directly', function(done){
      var app = http.createServer(function(req, res){
        send(req, 'test/fixtures' + req.url).pipe(res);
      });
      
      request(app)
      .get('/foobar')
      .expect(404, 'Not Found', done)
    })
  })

  describe('with conditional-GET', function(){
    it('should respond with 304 on a match', function(done){
      request(app)
      .get('/name.txt')
      .expect(200, function(err, res){
        if (err) return done(err)
        request(app)
        .get('/name.txt')
        .set('If-None-Match', res.headers.etag)
        .expect(304, function(err, res){
          if (err) return done(err)
          res.headers.should.not.have.property('content-type');
          res.headers.should.not.have.property('content-length');
          done();
        });
      })
    })

    it('should respond with 200 otherwise', function(done){
      request(app)
      .get('/name.txt')
      .expect(200, function(err, res){
        if (err) return done(err)
        request(app)
        .get('/name.txt')
        .set('If-None-Match', '"123"')
        .expect(200, 'tobi', done)
      })
    })
  })

  describe('with Range request', function(){
    it('should support byte ranges', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=0-4')
      .expect(206, '12345', done);
    })
    
    it('should be inclusive', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=0-0')
      .expect(206, '1', done);
    })
    
    it('should set Content-Range', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=2-5')
      .expect('Content-Range', 'bytes 2-5/9')
      .expect(206, done);
    })

    it('should support -n', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=-3')
      .expect(206, '789', done);
    })
    
    it('should support n-', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=3-')
      .expect(206, '456789', done);
    })

    it('should respond with 206 "Partial Content"', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=0-4')
      .expect(206, done);
    })

    it('should set Content-Length to the # of octets transferred', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=2-3')
      .expect('Content-Length', '2')
      .expect(206, '34', done);
    })

    describe('when last-byte-pos of the range is greater the length', function(){
      it('is taken to be equal to one less than the length', function(done){
        request(app)
        .get('/nums')
        .set('Range', 'bytes=2-50')
        .expect('Content-Range', 'bytes 2-8/9')
        .expect(206, done);
      })

      it('should adapt the Content-Length accordingly', function(done){
        request(app)
        .get('/nums')
        .set('Range', 'bytes=2-50')
        .expect('Content-Length', '7')
        .expect(206, done);
      })
    })

    describe('when the first- byte-pos of the range is greater length', function(){
      it('should respond with 416', function(done){
        request(app)
        .get('/nums')
        .set('Range', 'bytes=9-50')
        .expect('Content-Range', 'bytes */9')
        .expect(416, done);
      })
    })

    describe('when syntactically invalid', function(){
      it('should respond with 200 and the entire contents', function(done){
        request(app)
        .get('/nums')
        .set('Range', 'asdf')
        .expect(200, '123456789', done);
      })
    })

    describe('when multiple ranges', function(){
      it('should respond with 200 and the entire contents', function(done){
        request(app)
        .get('/nums')
        .set('Range', 'bytes=1-1,3-')
        .expect(200, '123456789', done);
      })
    })

    describe('when if-range present', function(){
      it('should respond with parts when etag unchanged', function(done){
        request(app)
        .get('/nums')
        .expect(200, function(err, res){
          if (err) return done(err);
          var etag = res.headers.etag;

          request(app)
          .get('/nums')
          .set('If-Range', etag)
          .set('Range', 'bytes=0-0')
          .expect(206, '1', done);
        })
      })

      it('should respond with 200 when etag changed', function(done){
        request(app)
        .get('/nums')
        .expect(200, function(err, res){
          if (err) return done(err);
          var etag = res.headers.etag.replace(/"(.)/, '"0$1');

          request(app)
          .get('/nums')
          .set('If-Range', etag)
          .set('Range', 'bytes=0-0')
          .expect(200, '123456789', done);
        })
      })

      it('should respond with parts when modified unchanged', function(done){
        request(app)
        .get('/nums')
        .expect(200, function(err, res){
          if (err) return done(err);
          var modified = res.headers['last-modified']

          request(app)
          .get('/nums')
          .set('If-Range', modified)
          .set('Range', 'bytes=0-0')
          .expect(206, '1', done);
        })
      })

      it('should respond with 200 when modified changed', function(done){
        request(app)
        .get('/nums')
        .expect(200, function(err, res){
          if (err) return done(err);
          var modified = Date.parse(res.headers['last-modified']) - 20000;

          request(app)
          .get('/nums')
          .set('If-Range', new Date(modified).toUTCString())
          .set('Range', 'bytes=0-0')
          .expect(200, '123456789', done);
        })
      })
    })
  })

  describe('when "options" is specified', function(){
    it('should support start/end', function(done){
      var app = http.createServer(function(req, res){
        var i = parseInt(req.url.slice(1));
        send(req, 'test/fixtures/nums', { start:i*3, end:i*3+2 }).pipe(res);
      });

      request(app)
      .get('/1')
      .expect(200, '456', done);
    })

    it('should adjust too large end', function(done){
      var app = http.createServer(function(req, res){
        var i = parseInt(req.url.slice(1));
        send(req, 'test/fixtures/nums', { start:i*3, end:90 }).pipe(res);
      });

      request(app)
      .get('/1')
      .expect(200, '456789', done);
    })

    it('should support start/end with Range request', function(done){
      var app = http.createServer(function(req, res){
        var i = parseInt(req.url.slice(1));
        send(req, 'test/fixtures/nums', { start:i*3, end:i*3+2 }).pipe(res);
      });

      request(app)
      .get('/0')
      .set('Range', 'bytes=-2')
      .expect(206, '23', done)
    })

    it('should support disabling etags', function(done){
      var app = http.createServer(function(req, res){
        send(req, req.url, {etag: false, root: fixtures})
        .pipe(res);
      });

      request(app)
      .get('/nums')
      .expect(200, function(err, res){
        if (err) return done(err);
        res.headers.should.not.have.property('etag');
        done();
      });
    })
  })
})

describe('send(file, options)', function(){
  describe('maxAge', function(){
    it('should default to 0', function(done){
      request(app)
      .get('/name.txt')
      .expect('Cache-Control', 'public, max-age=0', done)
    })

    it('should floor to integer', function(done){
      var app = http.createServer(function(req, res){
        send(req, 'test/fixtures/name.txt')
        .maxage(123956)
        .pipe(res);
      });

      request(app)
      .get('/name.txt')
      .expect('Cache-Control', 'public, max-age=123', done)
    })

    it('should accept string', function(done){
      var app = http.createServer(function(req, res){
        send(req, 'test/fixtures/name.txt')
        .maxage('1y')
        .pipe(res);
      });

      request(app)
      .get('/name.txt')
      .expect('Cache-Control', 'public, max-age=31557600', done)
    })

    it('should support Infinity', function(done){
      var app = http.createServer(function(req, res){
        send(req, 'test/fixtures/name.txt')
        .maxage(Infinity)
        .pipe(res);
      });
      
      request(app)
      .get('/name.txt')
      .expect('Cache-Control', 'public, max-age=31536000', done)
    })
  })

  describe('index', function(){
    it('should default to index.html', function(done){
      request(app)
      .get('/pets/')
      .expect(fs.readFileSync(path.join(fixtures, 'pets', 'index.html'), 'utf8'), done)
    })

    it('should be configurable', function(done){
      var app = http.createServer(function(req, res){
        send(req, req.url, {root: fixtures, index: 'tobi.html'})
        .pipe(res);
      });

      request(app)
      .get('/')
      .expect(200, '<p>tobi</p>', done);
    })

    it('should support disabling', function(done){
      var app = http.createServer(function(req, res){
        send(req, req.url, {root: fixtures, index: false})
        .pipe(res);
      });

      request(app)
      .get('/pets/')
      .expect(403, done);
    })

    it('should support fallbacks', function(done){
      var app = http.createServer(function(req, res){
        send(req, req.url, {root: fixtures, index: ['default.htm', 'index.html']})
        .pipe(res);
      });

      request(app)
      .get('/pets/')
      .expect(200, fs.readFileSync(path.join(fixtures, 'pets', 'index.html'), 'utf8'), done)
    })

    it('should 404 if no index file found (file)', function(done){
      var app = http.createServer(function(req, res){
        send(req, req.url, {root: fixtures, index: 'default.htm'})
        .pipe(res);
      });

      request(app)
      .get('/pets/')
      .expect(404, done)
    })

    it('should 404 if no index file found (dir)', function(done){
      var app = http.createServer(function(req, res){
        send(req, req.url, {root: fixtures, index: 'pets'})
        .pipe(res);
      });

      request(app)
      .get('/')
      .expect(404, done)
    })

    it('should not follow directories', function(done){
      var app = http.createServer(function(req, res){
        send(req, req.url, {root: fixtures, index: ['pets', 'name.txt']})
        .pipe(res);
      });

      request(app)
      .get('/')
      .expect(200, 'tobi', done)
    })
  })

  describe('hidden', function(){
    it('should default to false', function(done){
      request(app)
      .get('/.secret')
      .expect(404, 'Not Found', done)
    })
  })

  describe('root', function(){
    it('should set with deprecated from', function(done){
      var app = http.createServer(function(req, res){
        send(req, req.url, {from: __dirname + '/fixtures'})
        .pipe(res)
      });

      request(app)
      .get('/pets/../name.txt')
      .expect(200, 'tobi', done)
    })

    describe('when given', function(){
      it('should join root', function(done){
        var app = http.createServer(function(req, res){
          send(req, req.url, {root: __dirname + '/fixtures'})
          .pipe(res);
        });

        request(app)
        .get('/pets/../name.txt')
        .expect(200, 'tobi', done)
      })

      it('should restrict paths to within root', function(done){
        var app = http.createServer(function(req, res){
          send(req, req.url, {root: __dirname + '/fixtures'})
          .pipe(res);
        });

        request(app)
        .get('/pets/../../send.js')
        .expect(403, 'Forbidden', done)
      })

      it('should allow .. in root', function(done){
        var app = http.createServer(function(req, res){
          send(req, req.url, {root: __dirname + '/fixtures/../fixtures'})
          .pipe(res);
        });

        request(app)
        .get('/pets/../../send.js')
        .expect(403, 'Forbidden', done)
      })
    })

    describe('when missing', function(){
      it('should consider .. malicious', function(done){
        var app = http.createServer(function(req, res){
          send(req, fixtures + req.url)
          .pipe(res);
        });

        request(app)
        .get('/../send.js')
        .expect(403, 'Forbidden', done)
      })

      it('should still serve files with dots in name', function(done){
        var app = http.createServer(function(req, res){
          send(req, fixtures + req.url)
          .pipe(res);
        });

        request(app)
        .get('/do..ts.txt')
        .expect(200, '...', done);
      })
    })
  })
})
