
var send = require('..')
  , http = require('http')
  , Stream = require('stream')
  , request = require('supertest')
  , assert = require('assert');

// test server

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

  send(req, 'test/fixtures' + req.url)
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
    .expect('tobi', done);
  })

  it('should decode the given path as a URI', function(done){
    request(app)
    .get('/some%20thing.txt')
    .expect('hey', done);
  })

  it('should treat a malformed URI as a bad request', function(done){
    request(app)
    .get('/some%99thing.txt')
    .expect('Bad Request', done);
  })

  it('should treat an ENAMETOOLONG as a 404', function(done){
    var path = Array(100).join('foobar');
    request(app)
    .get('/' + path)
    .expect(404, done);
  })

  it('should support HEAD', function(done){
    request(app)
    .head('/name.txt')
    .expect('Content-Length', '4')
    .expect(200)
    .end(function(err, res){
      res.text.should.equal('');
      done();
    });
  })

  it('should add an ETag header field', function(done){
    request(app)
    .get('/name.txt')
    .end(function(err, res){
      if (err) return done(err);
      res.headers.should.have.property('etag');
      done();
    });
  })

  it('should add a Date header field', function(done){
    request(app)
    .get('/name.txt')
    .end(function(err, res){
      if (err) return done(err);
      res.headers.should.have.property('date');
      done();
    });
  })

  it('should add a Last-Modified header field', function(done){
    request(app)
    .get('/name.txt')
    .end(function(err, res){
      if (err) return done(err);
      res.headers.should.have.property('last-modified');
      done();
    });
  })

  it('should add a Accept-Ranges header field', function(done){
    request(app)
    .get('/name.txt')
    .expect('Accept-Ranges', 'bytes')
    .end(done);
  })

  it('should 404 if the file does not exist', function(done){
    request(app)
    .get('/meow')
    .expect(404)
    .expect('Not Found')
    .end(done);
  })

  it('should 301 if the directory exists', function(done){
    request(app)
    .get('/pets')
    .expect(301)
    .expect('Location', '/pets/')
    .expect('Redirecting to /pets/')
    .end(done);
  })

  it('should set Content-Type via mime map', function(done){
    request(app)
    .get('/name.txt')
    .expect('Content-Type', 'text/plain; charset=UTF-8')
    .end(function(){
      request(app)
      .get('/tobi.html')
      .expect('Content-Type', 'text/html; charset=UTF-8')
      .end(done);
    });
  })

  describe('when no "directory" listeners are present', function(){
    it('should respond with a redirect', function(done){
      var app = http.createServer(function(req, res){
        send(req, req.url)
        .root('test/fixtures')
        .pipe(res);
      });

      request(app)
      .get('/pets')
      .expect(301)
      .expect('Location', '/pets/')
      .expect('Redirecting to /pets/')
      .end(done);
    })
  })

  describe('when no "error" listeners are present', function(){
    it('should respond to errors directly', function(done){
      var app = http.createServer(function(req, res){
        send(req, 'test/fixtures' + req.url).pipe(res);
      });
      
      request(app)
      .get('/foobar')
      .expect('Not Found')
      .expect(404)
      .end(done);
    })
  })

  describe('with conditional-GET', function(){
    it('should respond with 304 on a match', function(done){
      request(app)
      .get('/name.txt')
      .end(function(err, res){
        var etag = res.headers.etag;

        request(app)
        .get('/name.txt')
        .set('If-None-Match', etag)
        .expect(304)
        .end(function(err, res){
          res.headers.should.not.have.property('content-type');
          res.headers.should.not.have.property('content-length');
          done();
        });
      })
    })

    it('should respond with 200 otherwise', function(done){
      request(app)
      .get('/name.txt')
      .end(function(err, res){
        var etag = res.headers.etag;

        request(app)
        .get('/name.txt')
        .set('If-None-Match', '123')
        .expect(200)
        .expect('tobi')
        .end(done);
      })
    })
  })

  describe('with Range request', function(){
    it('should support byte ranges', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=0-4')
      .expect('12345', done);
    })
    
    it('should be inclusive', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=0-0')
      .expect('1', done);
    })
    
    it('should set Content-Range', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=2-5')
      .expect('Content-Range', 'bytes 2-5/9', done);
    })

    it('should support -n', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=-3')
      .expect('789', done);
    })
    
    it('should support n-', function(done){
      request(app)
      .get('/nums')
      .set('Range', 'bytes=3-')
      .expect('456789', done);
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
      .expect('34')
      .expect('Content-Length', '2')
      .end(done);
    })

    describe('when last-byte-pos of the range is greater the length', function(){
      it('is taken to be equal to one less than the length', function(done){
        request(app)
        .get('/nums')
        .set('Range', 'bytes=2-50')
        .expect('Content-Range', 'bytes 2-8/9')
        .end(done);
      })

      it('should adapt the Content-Length accordingly', function(done){
        request(app)
        .get('/nums')
        .set('Range', 'bytes=2-50')
        .expect('Content-Length', '7')
        .end(done);
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
        .expect('123456789', done);
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
      .expect('456', done);
    })

    it('should support start/end with Range request', function(done){
      var app = http.createServer(function(req, res){
        var i = parseInt(req.url.slice(1));
        send(req, 'test/fixtures/nums', { start:i*3, end:i*3+2 }).pipe(res);
      });

      request(app)
      .get('/0')
      .set('Range', 'bytes=-2')
      .expect('23')
      .end(done);
    })
  })
})

describe('send(file, options)', function(){
  describe('maxAge', function(){
    it('should default to 0', function(done){
      request(app)
      .get('/name.txt')
      .expect('Cache-Control', 'public, max-age=0')
      .end(done);
    })

    it('should support Infinity', function(done){
      var app = http.createServer(function(req, res){
        send(req, 'test/fixtures/name.txt')
        .maxage(Infinity)
        .pipe(res);
      });
      
      request(app)
      .get('/name.txt')
      .expect('Cache-Control', 'public, max-age=31536000')
      .end(done);
    })
  })

  describe('index', function(){
    it('should default to index.html', function(done){
      request(app)
      .get('/pets/')
      .expect('tobi\nloki\njane')
      .end(done);
    })
  })

  describe('hidden', function(){
    it('should default to false', function(done){
      request(app)
      .get('/.secret')
      .expect(404)
      .expect('Not Found')
      .end(done);
    })
  })

  describe('root', function(){
    describe('when given', function(){
      it('should join root', function(done){
        var app = http.createServer(function(req, res){
          send(req, req.url)
          .root(__dirname + '/fixtures')
          .pipe(res);
        });

        request(app)
        .get('/pets/../name.txt')
        .expect('tobi')
        .end(done);
      })

      it('should restrict paths to within root', function(done){
        var app = http.createServer(function(req, res){
          send(req, req.url)
          .root(__dirname + '/fixtures')
          .on('error', function(err){ res.end(err.message) })
          .pipe(res);
        });

        request(app)
        .get('/pets/../../send.js')
        .expect('Forbidden')
        .end(done);
      })
    })

    describe('when missing', function(){
      it('should consider .. malicious', function(done){
        request(app)
        .get('/../send.js')
        .expect(403)
        .expect('Forbidden')
        .end(done);
      })
    })
  })
})