'use strict';

var http = require('http')
  , stream = require('stream')
  , q = require('q')
  , chai = require('chai')
  , sinon = require('sinon')
  , sinonChai = require('sinon-chai')
  , webhooklib = require('../../')
  , WebhookEndpoint = webhooklib.WebhookEndpoint
  , DumbStorageProvider = webhooklib.DumbStorageProvider
  , expect = chai.expect
  , PORT = 3000
  , TEST_BATCH = require('../smalltest.json');

chai.use(sinonChai);

function sendJSONRequest(body, options) {
  var deferred = q.defer()
    options = options || {};

  options.hostname = 'localhost';
  options.port = PORT;
  options.headers = options.headers || {
    'content-type': 'application/json'
  };
  options.method = options.method || 'POST';

  var req = http.request(options, function(res) {
    var respChunks = [];

    res.on('data', function(chunk) {
      respChunks.push(chunk);
    });

    res.on('end', function() {
      var respJSON = JSON.parse(Buffer.concat(respChunks).toString('utf8'));
      deferred.resolve({json: respJSON, response: res});
    });
  });

  req.on('error', function(err) {
    console.log(err);
    deferred.reject(err);
  });

  if (typeof body !== 'string') {
    body = JSON.stringify(body);
  }

  req.write(body);
  req.end();

  return deferred.promise;
}

function Cxt(port, storage, objectMode, next) {
  var self = this;

  self.storage = storage || new DumbStorageProvider();
  self.releaseBatchOrig = self.storage.releaseBatch.bind(self.storage);
  sinon.spy(self.storage, 'storeBatch');
  sinon.stub(self.storage, 'releaseBatch', self.releaseBatch.bind(self));

  self.server = new WebhookEndpoint({
    storageProvider: self.storage,
    ignoreNonArrayPayloads: objectMode
  });

  self.server.listen(port, next);
}

Cxt.prototype.onBatchStored = function(timeout) {
  var self = this
    , deferred = q.defer();

  if (typeof timeout !== 'number') {
    timeout = 1000;
  }

  next(self.storage.nextBatchID, Date.now());

  function next(batchIDSnapshot, startTime) {
    if (self.storage.nextBatchID !== batchIDSnapshot) {
      return deferred.resolve();
    }

    if (Date.now() - startTime >= timeout) {
      return deferred.reject(new Error('Timeout'));
    }

    setImmediate(next, batchIDSnapshot, startTime);
  }

  return deferred.promise;
};

Cxt.prototype.releaseBatch = function (batchID, next) {
  var self = this
    , promise = self.waitingForBatchPromise;

  if (self.waitingForN) {
    --self.waitingForN.n;
    if (self.waitingForN.n <= 0) {
      self.waitingForN.p.resolve();
      self.waitingForN = null;
    }
  }

  self.waitingForBatchPromise = null;
  self.releaseBatchOrig(batchID, function(err) {
    if (err) {
      if (promise) {
        promise.reject(err);
      }
      return next(err);
    }
    if (promise) {
      console.log('release');
      promise.resolve();
    }
    next(null);
  });
};

Cxt.prototype.waitForBatchRelease = function() {
  this.waitingForBatchPromise = q.defer();
  return this.waitingForBatchPromise.promise;
};

Cxt.prototype.waitForNBatchReleases = function(n) {
  this.waitingForN = {
    p: q.defer(),
    n: n
  };
  return this.waitingForN.p;
};

function justRelease(batch, _, next) {
  batch.release(next);
}

function throwError(batch, _, next) {
  next(new Error('Batch processing failed'));
}

// return a writable stream function that calls fnA the first n times it is written to,
// then calls fnB.
function nTimesAThenBConsumer(n, fnA, fnB) {
  var cnt = 0;
  return new stream.Writable({
    write: sinon.spy(function(batch, _, next) {
      if (cnt < n) {
        ++cnt;
        return fnA.apply(null, arguments);
      }
      return fnB.apply(null, arguments);
    })
  });
}

function makeBatchConsumer(writefn) {
  var strm = new stream.Writable({
    objectMode: true
  });
  strm._write = writefn;
  return strm;
}

describe('WebhookEndpoint HTTP API', function() {
  beforeEach('Start test endpoint', function(done) {
    this.cxt = new Cxt(PORT, null, true, done);
  });

  afterEach('Stop test endpoint', function(done) {
    // Ick: async http and batch processing makes the concept of completion hazy
    this.cxt.server.close(done);
  });

  it('should accept JSON POST requests', function(done) {
    this.cxt.onBatchStored().done(done);
    sendJSONRequest(TEST_BATCH).done();
  });

  it('should reject non-POST requests with a 400 code', function(done) {
    sendJSONRequest(TEST_BATCH, {method: 'GET'}).then(function(result) {
      expect(result.response.statusCode).to.equal(400);
      expect(result.json).to.include.key('msg');
      expect(result.json.msg).to.match(/non-POST/i);
    }).done(done);
  });

  it('should reject non-JSON requests with a 400 code', function(done) {
    sendJSONRequest(TEST_BATCH, { headers: {'content-type': 'text/plain'}}).then(function(result) {
      expect(result.response.statusCode).to.equal(400);
      expect(result.json).to.include.key('msg');
      expect(result.json.msg).to.match(/application\/json/i);
    }).done(done);
  });

  it('should reject malformed JSON with a 400 code', function(done) {
    sendJSONRequest('{"key: "value"}').then(function(result) {
      expect(result.response.statusCode).to.equal(400);
      expect(result.json).to.include.key('msg');
      expect(result.json.msg).to.match(/malformed/i);
    }).done(done);
  });
});

describe('WebhookEndpoint batch streaming (array payload mode)', function() {
  beforeEach('Start test endpoint', function(done) {
    this.cxt = new Cxt(PORT, null, true, done);
  });

  afterEach('Stop test endpoint', function(done) {
    // Ick: async http and batch processing makes the concept of completion hazy
    this.cxt.server.close(done);
  });

  it('should silently consume webhook pings (empty JSON request bodies)', function(done) {
    sendJSONRequest({}).done(function() { done(); } );
  });

  it('should pass legit batches downstream on receipt', function(done) {
    var self = this
      , writeFn = sinon.spy(justRelease)
      , consumer = makeBatchConsumer(writeFn);

    self.cxt.server.pipe(consumer);

    q.allSettled([
      sendJSONRequest(TEST_BATCH),
      self.cxt.onBatchStored(),
      self.cxt.waitForBatchRelease()]).then(function() {
        expect(writeFn).to.have.been.calledOnce;
        expect(writeFn.firstCall.args[0]).to.deep.include.members(TEST_BATCH);
    }).done(done);
  });

  it('should pass 1 batch downstream for each inbound batch', function(done) {
    var self = this
      , writeFn = sinon.spy(justRelease)
      , consumer = makeBatchConsumer(writeFn)
      , numberOfBatchesToIssue = 3;

    self.cxt.server.pipe(consumer);

    q.allSettled([self.cxt.waitForNBatchReleases(numberOfBatchesToIssue), sendJSONRequest(TEST_BATCH), sendJSONRequest(TEST_BATCH), sendJSONRequest(TEST_BATCH)])
    .then(function() {
      expect(writeFn).to.have.callCount(numberOfBatchesToIssue);
    }).done(done);
  });
});

describe('WebhookEndpoint batch storage', function() {
  beforeEach('Start test endpoint', function(done) {
    this.cxt = new Cxt(PORT, null, true, done);
  });

  afterEach('Stop test endpoint', function(done) {
    // Ick: async http and batch processing makes the concept of completion hazy
    this.cxt.server.close(done);
  });

  it('each legit batch should have a release() method', function(done) {
    var self = this
      , writeFn = sinon.spy(justRelease)
      , consumer = makeBatchConsumer(writeFn);

    this.cxt.server.pipe(consumer);

    q.allSettled([this.cxt.onBatchStored(), sendJSONRequest(TEST_BATCH)]).then(function() {
      expect(writeFn.firstCall.args[0]).to.respondTo('release');
    }).done(done);
  });

  it('should use storage.storeBatch() to store a batch after receipt but before calling the processor', function(done) {
    var self = this
      , writeFn = sinon.spy(justRelease)
      , consumer = makeBatchConsumer(writeFn);

    this.cxt.server.pipe(consumer);

    q.allSettled([self.cxt.onBatchStored(), sendJSONRequest(TEST_BATCH)]).then(function() {
      expect(self.cxt.storage.storeBatch).to.have.been.called;
      expect(self.cxt.storage.storeBatch).to.have.been.calledBefore(writeFn);
    }).done(done);
  });
});

describe('WebhookEndpoint batch storage (non-array payload mode)', function() {
  beforeEach('Start test endpoint', function(done) {
    this.cxt = new Cxt(PORT, null, false, done);
  });

  afterEach('Stop test endpoint', function(done) {
    // Ick: async http and batch processing makes the concept of completion hazy
    this.cxt.server.close(done);
  });

  it.only('should store JSON object payloads', function(done) {
    var self = this
      , writeFn = sinon.spy(justRelease)
      , consumer = makeBatchConsumer(writeFn);

    this.cxt.server.pipe(consumer);

    q.allSettled([self.cxt.onBatchStored(), sendJSONRequest({key: "value"})]).then(function() {
      expect(self.cxt.storage.storeBatch).to.have.been.called;
    }).done(done);
  });
});
