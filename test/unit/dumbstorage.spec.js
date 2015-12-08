var DumbStorageProvider = require('../../dumbstorage');

require('../lib/storage.spec.js')('DumbStorageProvider', function setup(next) {
  next(null, new DumbStorageProvider());
}, function teardown(next) { next(); });
