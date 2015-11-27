'use strict';

/*
 * HTTP endpoint intended to safely receive SparkPost webhook requests
 * and make them available to client code for processing.
 *
 */

var http = require('http')
  , DumbStorageProvider = require('./dumbstorage');

function WebhookEndpoint(storageProvider) {
  this.maxRetries = 5;
  this.server = http.createServer(this.receiveBatch.bind(this));
  this.storage = storageProvider || new DumbStorageProvider();
  this.close = this.server.close.bind(this.server);
}

WebhookEndpoint.prototype.listen = function(port, next) {
  if (!this.hasOwnProperty('processor')) {
    throw new Error('WebhookEndpoint#listen() called without a (valid) batch processor function.  See WebhookEndpoint#setBatchProcessor() for details.');
  }

  this.server.listen(port, next);
};

WebhookEndpoint.prototype.setBatchProcessor = function(processor) {
  this.processor = processor;
};

WebhookEndpoint.prototype.receiveBatch = function(req, res) {
  var self = this
    , reqBlocks = [];

  if (req.method !== 'POST') {
    return sendResponse(res, 400, 'Non-POST methods not supported');
  }

  if (req.headers['content-type'] !== 'application/json') {
    return sendResponse(res, 400, 'Expected application/json request');
  }

  req.on('data', function(chunk) {
    reqBlocks.push(chunk);
  });

  req.on('end', function() {
    var reqStr = Buffer.concat(reqBlocks).toString('utf8');
    self.validateAndStoreBatch(reqStr, res);
  });
};

WebhookEndpoint.prototype.validateAndStoreBatch = function(reqStr, res) {
  var self = this
    , batch;

  try {
    batch = JSON.parse(reqStr);
  } catch(e) {
    sendResponse(res, 400, 'Malformed JSON');
    return;
  }

  if (!Array.isArray(batch)) {
    return sendResponse(res, 200, 'ok');
  }

  self.storage.storeBatch(batch, function(err, batchID) {
    if (err) {
      return sendResponse(res, 500, err.message);
    }

    sendResponse(res, 200, 'ok');

    self.dispatchBatch(batch, batchID, 0);
  });
};

WebhookEndpoint.prototype.dispatchBatch = function(batch, batchID, retryCount) {
  var self = this;
  self.processor(batch, function(err) {
    if (err) {
      ++retryCount;
      if (retryCount < self.maxRetries) {
        return setImmediate(self.dispatchBatch.bind(self, batch, batchID, retryCount));
      } else {
        var throwme = new Error('Dispatch failure: unable to dispatch batch (batchID=' + batchID + '): ' + err);
        throwme.name = 'DispatchFailure';
        throwme.batchID = batchID;
        throw throwme;
      }
    }

    self.storage.releaseBatch(batchID, function(err) {
      if (err) {
        var throwme = new Error('Inconsistent state: unable to release a consumed batch from storage (batchID=' + batchID + '): ' + err);
        throwme.name = 'InconsistentState';
        throw throwme;
      }
    });
  });
};

// ----------------------------------------------------------------------------

function sendResponse(res, code, msg) {
  res.writeHead(code, {
    'Content-Type': 'application/json'
  });
  res.end(JSON.stringify({
    msg: msg
  }));
}

// ----------------------------------------------------------------------------

exports.WebhookEndpoint = WebhookEndpoint;
exports.DumbStorageProvider = DumbStorageProvider;
