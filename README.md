# Basic SparkPost Webhook Endpoint

This module allows one to safely receive [SparkPost.com](https://www.sparkpost.com/) webhook events.  As such, it provides a basic webhook endpoint implementation and offers a Node readable stream interface.

### Usage

1. Install the sp-webhook-endpoint module:

```
npm install https://github.com/ewandennis/sp-webhook-endpoint.git --save
```

2. Create a WebhookEndpoint instance and pipe it to a writable stream:

```
var stream = require('stream')
  , WebhookEndpoint = require('sp-webhook-endpoint').WebhookEndpoint
  , batchConsumer = new stream.Writable({objectMode:true})
  , endpoint;

batchConsumer._write = function(batch, enc, next) {
  // Process batch
  console.log('Received batch of ' + batch.length + ' events');
  batch.release(next);
};

endpoint = new WebhookEndpoint();
endpoint.pipe(batchConsumer);
endpoint.listen(3000);
```

3. To test your endpoint, send a batch of test events through it:

```curl -XPOST -H "Content-Type: application/json" -d @node_modules/sp-webhook-endpoint/test/smalltest.json http://localhost:3000/```

You should receive an 'ok' JSON response:

```{"msg":"ok"}```

### 