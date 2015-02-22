[![Build Status](https://travis-ci.org/Colex/maestrojs.svg?branch=master)](https://travis-ci.org/Colex/maestrojs)

# MaestroJs
__Maestro.js__ is a library that helps dynamically orchestrate different services using __Redis__.
Services do not need to know any information about the service they depend on _(only the name)_, this library will be responsible to resolve the options necessary to connect to all services and keep the service updated with the latest options.

__Maestro.js goal is to be *very* simple to set up__

__Use case:__ You have 5 services using a cluster of redis machines for caching. You add a new redis and insert it into redis. Now all your services using that cache cluster will seamlessly update to use this new cache.

## Example
```javascript
var redis = require('redis');
var Maestro = require("maestrojs");

/**
 * Initialize Maestro with Redis endpoint
 */
var maestro = new Maestro("127.0.0.1", 6379); //default values

/**
 * Wait for Redis information and connect to it
 * (If another redis registers, then Maestro will automatically
 * update your application to use it)
 */
maestro.use('services.redis', function(entries) {
  var redis = redis.createClient(entries[0].endpoint);
  app.use('redis', redis);
})


/**
 * Register the interface for this service
 */
maestro.register("services.api", {
  endpoint: "198.176.45.68",
  version: 2.1,
  something: true
});

/**
 * Start the service
 * (it will only be executed after all dependencies are resolved)
 */
maestro.start(function() {
  // Start listening for requests
});
```

## API
### Maestro.use(_serviceName_, _setupCallback_)
Declare a dependency and a callback for setting up this dependency. The callback is called everytime that service is updated. _(in the case of a cache cluster, if a new cache node registers, the setup callback will be run again)_
```javascript
maestro.use('services.queue', function(entries) {
  var queues = [], sqs;
  for (var i = 0; i < entries.length; i++) {
    sqs = new Sqs(entries[i].endpoint);
    queues.push(sqs);
  }
  app.use("queues", queues);
})
```

### Maestro.register(_serviceName__, options)
Declare a service's interface. It will automatically __append__ the service to the list as soon as it is __available__. It is important that your service __does not__ replace a service under the same name. This way you may have __several nodes__ serving the __same service__.
_Options__ is an object containing as many attributes as desired. _(\__id is a reserved attribute)_.
```javascript
maestro.register("services.mailer", {
  endpoint: "198.167.14.1",
  supportHtml: true,
  version: 3
});
```
The service will be registered after the __start function__ runs.

### Maestro.start(callback)
Callback function called as soon as as __all dependencies__ are resolved. Make sure to have all the dependencies declared before calling this function.
```javascript
maestro.start(function() {
  var server = app.listen(3000);
})
```
You may register your service within the __start callback__:
```javascript
maestro.start(function() {
  var server = app.listen(3000, function () {
    var host = server.address().address
    var port = server.address().port

    maestro.register("services.mailer", {
      host: host,
      port: port
    });
  })
})
```

### Maestro.quit(_callback_)
Quitting allows you to __automatically unregister__ your service and __updating all__ services dependent on yours. Quitting will also close all connections to redis, so it won't receive more updates from other services, therefore use it only when you intend to close your service.
```javascript
maestro.quit(function() {
  console.log("Service unregistered and connections closed")
});
```

### Maestro.unregister(_callback_)
If you want to __unregister__ your service __but not__ stop listening to updates from other services. You may use ```Maestro.unregister```, which will unregister your service and update all services dependent on it.
```javascript
maestro.unregister(function() {
  console.log("Service unregistered")
});
```

## Redis Configuration
It is __important__ to notice that we require Redis to be configured to notify Maestro in case of key changes. You may set ``notify-keyspace-events "AKE"`` in __redis.conf__ or start redis as ``./redis-server --notify-keyspace-events AKE``

## TODO
- Support Redis Sentinel (to remove SPoF)
