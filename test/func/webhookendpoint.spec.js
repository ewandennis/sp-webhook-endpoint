'use strict';

var http = require('http')
  , q = require('q')
  , chai = require('chai')
  , sinon = require('sinon')
  , sinonChai = require('sinon-chai')
  , webhooklib = require('../../webhookendpoint')
  , WebhookEndpoint = webhooklib.WebhookEndpoint
  , DumbStorageProvider = webhooklib.DumbStorageProvider
  , expect = chai.expect
  , PORT = 3000
  , TEST_BATCH = require('../smalltest.json');

chai.use(sinonChai);

function sendJSONRequest(body) {
  var deferred = q.defer()
    , options = {
    hostname: 'localhost',
    port: PORT,
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    }
  };

  var req = http.request(options, function(res) {
    var respChunks = [];

    res.on('data', function(chunk) {
      respChunks.push(chunk);
    });

    res.on('end', function() {
      var respJSON = JSON.parse(Buffer.concat(respChunks).toString('utf8'));
      deferred.resolve(respJSON);
    });
  });

  req.on('error', function(err) {
    console.log(err);
    deferred.reject(err);
  });

  req.write(JSON.stringify(body));
  req.end();

  return deferred.promise;
}

function Cxt() {
  var self = this;

  self.storage = new DumbStorageProvider();
  self.releaseBatchOrig = self.storage.releaseBatch.bind(self.storage);
  sinon.spy(self.storage, 'storeBatch');
  sinon.stub(self.storage, 'releaseBatch', self.releaseBatch.bind(self));

  self.server = new WebhookEndpoint(self.storage);

  self.nullBatchProcessor = sinon.spy(nullBatchProcessor);
  self.server.setBatchProcessor(self.nullBatchProcessor);
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

  self.waitingForBatchPromise = null;
  self.releaseBatchOrig(batchID, function(err) {
    if (err) {
      if (promise) {
        promise.reject(err);
      }
      return next(err);
    }
    if (promise) {
      promise.resolve();
    }
    next(null);
  });
};

Cxt.prototype.waitForBatchRelease = function() {
  this.waitingForBatchPromise = q.defer();
  return this.waitingForBatchPromise.promise;
};

function nullBatchProcessor(batch, next) {
  next();
}

function badBatchProcessor(batch, next) {
  next(new Error('Batch processing failed'));
}

// return a function that calls fnA the first n times it is called,
// then calls fnB.
function nTimesAThenB(n, fnA, fnB) {
  var cnt = 0;
  return function() {
    if (cnt < n) {
      ++cnt;
      return fnA.apply(null, arguments);
    }
    return fnB.apply(null, arguments);
  };
}

describe('WebhookEndpoint', function() {
  beforeEach('Start test endpoint', function(done) {
    this.cxt = new Cxt();
    this.cxt.server.listen(PORT, done);
  });

  afterEach('Stop test endpoint', function(done) {
    // Ick: async http and batch processing makes the concept of completion hazy
    this.cxt.server.close(done);
  });

  it('should accept JSON POST requests', function(done) {
    this.cxt.onBatchStored().done(done);
    sendJSONRequest(TEST_BATCH).done();
  });

  it('should silently consume webhook pings (empty JSON request bodies)', function(done) {
    this.cxt.server.setBatchProcessor(badBatchProcessor);
    sendJSONRequest({}).done(function() { done(); } );
  });

  it('should call its processor function when a legit webhook batch is received', function(done) {
    var self = this;
    q.allSettled([this.cxt.onBatchStored(), sendJSONRequest(TEST_BATCH)]).then(function() {
      expect(self.cxt.nullBatchProcessor).to.have.been.calledOnce;
    }).done(done);
  });

  it('should use storage.storeBatch() to store a batch after receipt but before calling the processor', function(done) {
    var self = this;
    q.allSettled([self.cxt.onBatchStored(), sendJSONRequest(TEST_BATCH)]).then(function() {
      expect(self.cxt.storage.storeBatch).to.have.been.called;
      expect(self.cxt.storage.storeBatch).to.have.been.calledBefore(self.cxt.nullBatchProcessor);
    }).done(done);
  });

  it('should release a batch if the processor calls next without an error', function(done) {
    var self = this;
    q.allSettled([self.cxt.onBatchStored(), sendJSONRequest(TEST_BATCH)]).then(function() {
      expect(self.cxt.storage.releaseBatch).to.have.been.called;
    }).done(done);
  });

  it('should not release a batch if the processor calls next with an error', function(done) {
    var self = this
      , numFailures = 2
      , processor = sinon.spy(nTimesAThenB(numFailures, badBatchProcessor, nullBatchProcessor));

    this.cxt.server.setBatchProcessor(processor);
    q.allSettled([self.cxt.onBatchStored(), sendJSONRequest(TEST_BATCH)]).then(function() {
      expect(self.cxt.storage.releaseBatch).not.to.have.been.called;
    }).done(done);
  });

  it('should call the processor again with a batch after it fails to dispatch', function(done) {
    var self = this
      , numFailures = 2
      , processor = sinon.spy(nTimesAThenB(numFailures, badBatchProcessor, nullBatchProcessor));

    this.cxt.server.setBatchProcessor(processor);
    q.allSettled([sendJSONRequest(TEST_BATCH), self.cxt.waitForBatchRelease()]).then(function() {
      expect(processor).to.have.callCount(numFailures+1);
    }).done(done);
  });
});
