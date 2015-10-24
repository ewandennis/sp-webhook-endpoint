var chai = require('chai')
  , DumbStorageProvider = require('../../dumbstorage')
  , expect = chai.expect
  , TEST_BATCH = require('../test.json');

describe('DumbStorageProvider', function() {
  beforeEach('Create object under test', function(done) {
    this.storage = new DumbStorageProvider();
    done();
  });

  describe('#storeBatch', function() {
    it('should accept a batch and call next', function(done) {
      this.storage.storeBatch(TEST_BATCH, done);
    });
  });

  describe('#retrieveBatch', function() {
    it('should retrieve a batch previously passed to #storeBatch', function(done) {
      var self = this;
      self.storage.storeBatch(TEST_BATCH, function(err) {
        expect(err).to.be.null;
        self.storage.retrieveBatch(function(err, id, batch) {
          expect(err).to.be.null;
          expect(id).not.to.be.null;
          expect(batch).to.deep.equal(TEST_BATCH);
          done();
        });
      });
    });

    it('should return a null id and batch if no batch is available', function(done) {
      var self = this;
      self.storage.retrieveBatch(function(err, id, batch) {
        expect(err).to.be.null;
        expect(id).to.be.null;
        expect(batch).to.be.null;
        done();
      });
    });
  });

  describe('#releaseBatch', function() {
    it('should cause the last stored batch to be forgotten', function(done) {
      var self = this;
      self.storage.storeBatch(TEST_BATCH, function(err) {
        expect(err).to.be.null;
        self.storage.retrieveBatch(function(err, id, batch) {
          expect(err).to.be.null;
          expect(id).not.to.be.null;
          expect(batch).not.to.be.null;
          self.storage.releaseBatch(id, function(err) {
            expect(err).to.be.null;
            self.storage.retrieveBatch(function(err, id, batch) {
              expect(err).to.be.null;
              expect(id).to.be.null;
              expect(batch).to.be.null;
              done();
            });
          });
        });
      });
    });
  });
});
