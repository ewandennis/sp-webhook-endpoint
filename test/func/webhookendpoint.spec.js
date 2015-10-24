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
  , TEST_BATCH = require('../test.json');

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

describe('WebhookEndpoint', function() {
  beforeEach('Start test endpoint', function(done) {
    this.storage = new DumbStorageProvider();
    this.server = new WebhookEndpoint(this.storage);
    sinon.spy(this.storage, 'storeBatch');
    this.server.listen(PORT, done);
  });

  afterEach('Stop test endpoint', function(done) {
    this.server.close(done);
  });

  it('should present accept JSON POST requests', function(done) {
    sendJSONRequest(TEST_BATCH).done(function() { done(); });
  });

  it('should silently consume webhook pings (empty JSON request bodies)', function(done) {
    this.server.on('batchReceived', function() {
      throw new Error('Not expecting a batch');
    });
    sendJSONRequest({}).done(function() { done(); } );
  });

  it('should emit the \'batchReceived\' event when a webhook batch is received', function(done) {
    batchReceived = sinon.spy(function batchReceived_() {});
    this.server.on('batchReceived', batchReceived);
    sendJSONRequest(TEST_BATCH).then(function() {
      expect(batchReceived).to.have.been.calledOnce;
    }).done(done);
  });

  it('should use storage.storeBatch() to store a batch after receipt but before emitting \'batchReceived\'', function(done) {
    var self = this;
    batchReceived = sinon.spy(function batchReceived_() {});
    this.server.on('batchReceived', batchReceived);
    sendJSONRequest(TEST_BATCH).then(function() {
      expect(self.storage.storeBatch).to.have.been.calledBefore(batchReceived);
    }).done(done);
  });
});
