/*
 * Create a SparkPost webhook endpoint using PostgresSQL as durable storage.
 *
 * Note: without consuming incoming batches by reading the endpoint stream,
 * they will be written to durable storage indefinitely.
 * 
 */

var WebhookEndpoint = require('sp-webhook-endpoint').WebhookEndpoint
  , PgStorageProvider = require('sp-webhook-endpoint').PgStorageProvider
  , dburl = process.env.DATABASE_URL ||
    process.env.npm_package_config_pgurl || 'postgres://localhost/spwebhookendpoint'

endpoint = new WebhookEndpoint({storageProvider: new PgStorageProvider({dburl: dburl})});

endpoint.listen(3000);

// To test, send a batch of test events:
//  curl -XPOST -H "Content-Type: application/json" -d @node_modules/sp-webhook-endpoint/test/smalltest.json http://localhost:3000/
