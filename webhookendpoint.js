'use strict';

/*
 * HTTP endpoint intended to receive SparkPost webhook requests.
 *
 * This type emits events to allow client code to process webhook event batches.
 *
 * event 'batchReceived':
 *  Arguments: JSON batch (Array)
 *  batchReceived is emitted when a new batch has been received.
 */

var http = require('http')
  , EventEmitter = require('events')
  , DumbStorageProvider = require('./dumbstorage');

function WebhookEndpoint(storageProvider) {
  EventEmitter.call(this);
  this.server = http.createServer(this.processRequest.bind(this));
  this.storage = storageProvider || new DumbStorageProvider();

  this.listen = this.server.listen.bind(this.server);
  this.close = this.server.close.bind(this.server);
}

WebhookEndpoint.prototype.__proto__ = EventEmitter.prototype;

exports.WebhookEndpoint = WebhookEndpoint;
exports.DumbStorageProvider = DumbStorageProvider;

WebhookEndpoint.prototype.processRequest = function(req, res) {
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
    var reqStr = Buffer.concat(reqBlocks).toString('utf8')
      , reqJSON;

    try {
      reqJSON = JSON.parse(reqStr);
    } catch(e) {
      sendResponse(res, 400, 'Malformed JSON');
      return;
    }

    self.consumeBatch(reqJSON, res);
  });
};

WebhookEndpoint.prototype.consumeBatch = function(batch, res) {
  var self = this;
  if (Array.isArray(batch)) {
    self.storage.storeBatch(batch, function(err) {
      if (err) {
        sendResponse(res, 500, err.message);
        self.emit('error', err);
      } else {
        sendResponse(res, 200, 'ok');
        self.emit('batchReceived', self.storage);
      }
    });
  } else {
    self.emit('pingReceived', batch);
    sendResponse(res, 200, 'ok');
  }
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
