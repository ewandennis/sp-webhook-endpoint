'use strict';

var fs = require('fs')
  , assert = require('assert')
  , pg = require('pg')
  , ddlPath = './ddl/pgddl.sql'
  , tblName = 'spwebhookendpoint.batches'

/*
 * PostgreSQL storage provider for WebhookEndpoint.
 */

function PgStorageProvider(options) {
  options = options || {};
  this.dburl = options.dburl;
  assert(typeof this.dburl === 'string', 'options.dburl must be defined.');
}

module.exports = PgStorageProvider;

PgStorageProvider.prototype.storeBatch = function(batch, next) {
  var self = this;
  pg.connect(self.dburl, function(err, client, done) {
    if (err) {
      return next('While attempting to store a batch, connection failed to db url=' + self.dburl + ': ' + err);
    }
    client.query('INSERT INTO ' + tblName + ' (batch) VALUES ($1) RETURNING batch_uuid', [JSON.stringify(batch)], function(err, result) {
      if (err) {
        done();
        return next(err);
      }
      done();
      return next(null, result.rows[0].batch_uuid);
    });
  });
};

PgStorageProvider.prototype.retrieveBatch = function(next) {
  var self = this;
  pg.connect(self.dburl, function(err, client, done) {
    if (err) {
      return next('While attempting to retrieve a batch, connection failed to db url=' + self.dburl + ': ' + err);
    }
    client.query('SELECT * FROM ' + tblName + ' ORDER BY received_at DESC LIMIT 1', function(err, result) {
      if (err) {
        done();
        return next(new Error('Failed to retrieve newest batch: ' + err));
      }
      if (result.rows.length === 0) {
        done();
        return next(null, null, null);
      }
      done();
      // TODO: JSON.parse could throw
      return next(null, result.rows[0].batch_uuid, result.rows[0].batch);
    });
  });
};

PgStorageProvider.prototype.releaseBatch = function(id, next) {
  var self = this;
  pg.connect(self.dburl, function(err, client, done) {
    client.query('DELETE FROM ' + tblName + ' WHERE batch_uuid=$1', [id], function(err, result) {
      if (err) {
        done();
        return next(new Error('Failed to delete batch uuid=' + id + ': ' + err));
      }
      done();
      return next(null);
    });
  });
};

module.exports = PgStorageProvider;
