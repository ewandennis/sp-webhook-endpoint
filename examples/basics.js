/*
 * Create a SparkPost webhook endpoint using PostgresSQL as durable storage
 * then read and release event batches as they arrive from the endpoint stream.
 */

var stream = require('stream')
  , WebhookEndpoint = require('sp-webhook-endpoint').WebhookEndpoint
  , PgStorageProvider = require('sp-webhook-endpoint').PgStorageProvider
  , batchConsumer = new stream.Writable({objectMode:true})
  , endpoint
  , dburl = process.env.DATABASE_URL ||
    process.env.npm_package_config_pgurl || 'postgres://localhost/spwebhookendpoint'

batchConsumer._write = function(batch, enc, next) {
  console.log('Received batch of ' + batch.length + ' events: ' + batch.id);
  batch.release(next);
};

endpoint = new WebhookEndpoint({storageProvider: new PgStorageProvider({dburl: dburl})});

endpoint.pipe(batchConsumer);

endpoint.listen(3000);

// To test, send a batch of test events:
//  curl -XPOST -H "Content-Type: application/json" -d @node_modules/sp-webhook-endpoint/test/smalltest.json http://localhost:3000/
