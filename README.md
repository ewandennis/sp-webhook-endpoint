# Basic SparkPost Webhook Endpoint

This module allows one to safely receive [SparkPost.com](https://www.sparkpost.com/) webhook events.

Features include:

 - Storage of incoming event batches before issuing 200 response to SparkPost.com
 - Node.JS readable stream interface

### Usage

Install the sp-webhook-endpoint module:

```
npm install https://github.com/ewandennis/sp-webhook-endpoint.git --save
```

Create a WebhookEndpoint instance and pipe it to a writable stream:

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

To test your endpoint, send a batch of test events through it:

```curl -XPOST -H "Content-Type: application/json" -d @node_modules/sp-webhook-endpoint/test/smalltest.json http://localhost:3000/```

You should receive an 'ok' JSON response:

```{"msg":"ok"}```

### Examples

See the examples/ directory.

### The StorageProvider Interface

To ensure webhook event batches are not lost between receipt and processing, this module stores each batch using a 'StorageProvider'.



The StorageProvider is responsible for durable storage: the acceptance, storage and retrieval of event batches.

To implement your own StorageProvider, create an object with the following methods:

 - storeBatch(batch, next)
  - callback args:
    - ID: a batch identifier of some sort (opaque)
 - retrieveBatch(next)
  - callback args:
    - ID: the identifier of the retrieved batch (opaque)
    - batch: the event batch itself (array)
 - releaseBatch(id, next)
  - callback args:
    - ID: the identifier of the batch to release from storage

Note: The module includes a 'DumbStorageProvider' as an example implementation.

You might also want to use tests/unitdumbstorage.spec.js to validate your implementation.
