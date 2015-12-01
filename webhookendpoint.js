'use strict';

/*
 * HTTP endpoint intended to safely receive SparkPost webhook requests
 * and make them available to client code for processing as an object mode
 * readable stream.
 */

var http = require('http')
  , util = require('util')
  , Readable = require('stream').Readable
  , DumbStorageProvider = require('./dumbstorage');


util.inherits(WebhookEndpoint, Readable);

/*
 * WebhookEndpoint ctor
 * options:
 *    storageProvider: an interface for holding webhook event batches (see DumStorageProvider.js for a sample impl)
 */
function WebhookEndpoint(options) {
  Readable.call(this, {objectMode: true});

  options = options || {};

  this.storage = options.storageProvider || new DumbStorageProvider();

  this.keepReading = false;

  this.server = http.createServer(this.receiveBatch.bind(this));
  this.close = this.server.close.bind(this.server);
  this.listen = this.server.listen.bind(this.server);
}

// Readable stream _read
// Pull batch from storage, wrap it and push it downstream
WebhookEndpoint.prototype._read = function(_) {
  var self = this;

  this.keepReading = true;

  self.storage.retrieveBatch(function(err, id, batch) {
    if (err) {
      // TODO: ?
      return;
    }

    if (id !== null && batch !== null) {
      self.keepReading = self.pushBatch(id, batch);
    }
  });
};

WebhookEndpoint.prototype.pushBatch = function(id, batch) {
  var self = this;
  batch.id = id;
  batch.release = function(next) {
    if (!next) {
      throw new Error('release() takes a callback as its argument');
    }
    self.storage.releaseBatch(id, next);
  };
  return self.push(batch);
}

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
    self.validateStoreAndRespond(reqStr, res);
  });
};

WebhookEndpoint.prototype.validateStoreAndRespond = function(reqStr, res) {
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

    // Push downstream if we have an unanswered _read() call
    if (self.keepReading) {
      self.keepReading = self.pushBatch(batchID, batch);
    }
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

module.exports = WebhookEndpoint;
