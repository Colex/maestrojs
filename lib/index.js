var redis = require("redis")
var async = require("async");

var Maestro = (function() {

  function Maestro(host, port, options) {
    var self = this;

    host = host || "127.0.0.1";
    port = port || 6379;
    options = options || {};

    self.subscription = {};
    self.subscriber = redis.createClient(port, host, options);
    self.client = redis.createClient(port, host, options);

    self.subscriber.on("message", function(key, event) {
      self.resolve(self.subscription[key]);
    })

  }

  Maestro.prototype.use = function(service, setup) {
    var key = '__keyspace@0__:'+service;
    this.subscription[key] = { key: service, callback: setup, resolved: false };
    this.subscriber.subscribe(key);
    this.resolve(this.subscription[key], true);
  }

  Maestro.prototype.resolve = function(service, ifExistsOnly) {
    var self = this;
    self.client.get(service.key, function(err, value) {
      if (value !== null || !ifExistsOnly)
        service.callback(JSON.parse(value));
      service.resolved = value !== null;
      self.tryStart();
    })
  }

  Maestro.prototype.register = function(service, options) {
    this.service = service;
    this.options = options;
    this.tryRegister()
  }

  Maestro.prototype.start = function(callback) {
    this.startCallback = callback;
    this.tryStart();
  }

  Maestro.prototype.tryStart = function() {
    var service;
    if (this.started || typeof this.startCallback !== "function") return;
    for (var key in this.subscription) {
      service = this.subscription[key];
      if (!service.resolved) return false;
    };
    this.started = true;
    this.startCallback();
    this.tryRegister();
    return true;
  }

  Maestro.prototype.tryRegister = function() {
    var self = this;
    if (!self.started || self.registered || typeof self.service !== "string" || typeof self.options !== "object") return;
    function atomicRegister() {
      self.client.get(self.service, function(err, value) {
        var entries = JSON.parse(value) || [];
        entries.push(self.options);

        var luaScript = "\
        if (redis.call('get', KEYS[1]) == ARGV[1]) or (ARGV[3] == '0' and redis.call('exists', KEYS[1]) == 0) then\
          return redis.call('set', KEYS[1], ARGV[2])\
        else\
          return 1\
        end"

        self.client.eval(
          [
            luaScript, 3,
            self.service,                   // KEYS[1]
            "value",                        // KEYS[2]
            "length",                       // KEYS[3]
            value,                          // ARGV[1]
            JSON.stringify(entries),        // ARGV[2]
            (JSON.parse(value)||[]).length  // ARGV[3]
          ],
          function(err, val) {
            if (val !== 'OK')
              atomicRegister();
          }
        );
      });
    }

    self.registered = true;
    self.options.__id = (new Date()).getTime() + ":" + Math.floor(Math.random()*1000000)
    atomicRegister();
  }

  Maestro.prototype.unregister = function(cb) {
    var self = this;

    if (typeof this.service !== "string" || typeof this.options !== "object") {
      if (typeof cb === "function") cb();
      return;
    }


    function atomicUnregister(service, id) {
      self.client.get(service, function(err, value) {
        var currEntries = JSON.parse(value) || [];
        var entries = []

        for (var i = 0; i < currEntries.length; i++) {
          if (currEntries[i].__id != id)
            entries.push(currEntries[i]);
        }

        var luaScript = "\
        if (redis.call('get', KEYS[1]) == ARGV[1]) then\
          return redis.call('set', KEYS[1], ARGV[2])\
        elseif (redis.call('exists', KEYS[1]) == 0) then\
          return 'OK'\
        else\
          return 1\
        end"

        self.client.eval(
          [
            luaScript, 2,
            service,                        // KEYS[1]
            "value",                        // KEYS[2]
            value,                          // ARGV[1]
            JSON.stringify(entries),        // ARGV[2]
          ],
          function(err, val) {
            if (val !== 'OK') {
              atomicUnregister(service, id);
            } else {
              self.registered = false;
              if (typeof cb === "function") cb();
            }
          }
        );
      });
    }

    atomicUnregister(this.service, this.options.__id)

    this.service = null;
    this.options = null;
  }

  Maestro.prototype.quit = function(cb) {
    var self = this;

    if (self.exited) {
      cb();
      return;
    }

    async.waterfall([
      function(cb) { self.unregister(cb) },
      function(cb) { self.subscriber.quit(function() { cb(null); }) },
      function(cb) { self.client.quit(function() { cb(null); }) }
    ], function(err, results) {
      if (typeof cb === "function") cb();
      self.exited = true;
    })
  }

  return Maestro;

})();

exports = module.exports = Maestro;


// maestro = new Maestro();
// // client = maestro.subscriber;

// maestro.register("services.api", { a: 1 })

// maestro.start(function() {})


// setTimeout(function() {
//   maestro.quit();
// }, 5000)

// client.on("message", function(pattern, channel, value) {
//   console.log(pattern, channel, "=>", value);
// });


// client.subscribe('__keyspace@0__:services.test');
// client.set("test", 2)



// setTimeout(client.quit.apply(client), 10000)
