'use strict';

/*
 * In-memory storage provider for WebhookEndpoint.
 * WARNING: unsafe at any speed.  DO NOT USE IN PRODUCTION.
 */

function DumbStorageProvider() {
  this.batches = [];
  this.nextBatchID = 0;
}

module.exports = DumbStorageProvider;

DumbStorageProvider.prototype.storeBatch = function(batch, next) {
  var self = this
    , batchrec = {
      id: self.nextBatchID++,
      batch: batch
    };

  self.batches.push(batchrec);
  next(null, batchrec.id);
};

DumbStorageProvider.prototype.retrieveBatch = function(next) {
  var self = this;
  if (self.batches.length > 0) {
    var batch = self.batches.shift();
    next(null, batch.id, batch.batch);
  } else {
    next(null, null, null);
  }
};

DumbStorageProvider.prototype.releaseBatch = function(id, next) {
  var self = this;
  self.batches = self.batches.filter(function(b) { return b.id !== id; });
  next(null);
};
