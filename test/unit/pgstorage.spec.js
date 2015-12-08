'use strict';

var pg =require('pg')
  , PgStorageProvider = require('../../pgstorage')
  , storageSpec = require('../lib/storage.spec.js')
  , tblName = 'spwebhookendpoint.batches'
  , dburl = process.env.DATABASE_URL ||
    process.env.npm_package_config_pgurl || 'postgres://localhost/spwebhookendpoint'
  , cleanupAfterwards = true;

storageSpec('PgStorageProvider', function setup(next) {
  return next(null, new PgStorageProvider({dburl: dburl}));
}, function teardown(next) {
  if (!cleanupAfterwards) {
    return next();
  }

  pg.connect(dburl, function(err, client, done) {
    if (err) {
      return next('While attempting to clear out the database, connection failed to db url=' + dburl + ': ' + err);
    }
    client.query('DELETE FROM ' + tblName, function(err, result) {
      done();
      if (err) {
        return next('While attempting to clear out the database, delete query failed: ' + err);
      }
      next();
    });
  });
});
