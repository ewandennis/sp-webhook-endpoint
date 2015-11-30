var stream = require('stream')
  , WebhookEndpoint = require('sp-webhook-endpoint').WebhookEndpoint
  , batchConsumer = new stream.Writable({objectMode:true})
  , endpoint;

batchConsumer._write = function(batch, enc, next) {
  console.log('open transaction');
  console.log('\tprocess batch of ' + batch.length + ' events');
  batch.release(function(err) {
    if (err) {
      console.log('\trollback transaction');
      next(err);
    } else {
      console.log('\tcommit transaction');
      next();
    }
  });
};

endpoint = new WebhookEndpoint();

endpoint.pipe(batchConsumer);

endpoint.listen(3000);

// To test, send a batch of test events:
//  curl -XPOST -H "Content-Type: application/json" -d @node_modules/sp-webhook-endpoint/test/smalltest.json http://localhost:3000/
