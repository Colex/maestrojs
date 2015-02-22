var should = require('should');
var Maestro = require('../lib/index');
var async = require('async');

describe("Maestrojs", function() {
  var maestro;

  beforeEach(function(done) {
    async.waterfall([
      function(cb) { if (maestro) { maestro.quit(cb) } else { cb(); } },
      function(cb) { maestro = new Maestro(); cb(); },
      function(cb) { maestro.client.del('services.test', function(err) { cb(); }) },
      function(cb) { maestro.client.del('services.cache', function(err) { cb(); }) },
      function(cb) { maestro.client.del('services.api', function(err) { cb(); }) }
    ], function() {
      done();
    })
  })

  describe("when initialized", function() {
    it("should connect to Redis", function(done) {
      var value = Math.floor(Math.random()*1000);

      maestro.client.set("services.test", value, function() {
        maestro.client.get("services.test", function(err, res) {
          var number = parseInt(res);
          number.should.be.exactly(value).and.be.a.Number
          done()
        })
      });
    })
  })

  describe("on use()", function() {
    it("should run callback when service retrieved", function(done) {
      maestro.client.set("services.cache", JSON.stringify({ host: '198.172.64.45', port: 6478 }), function() {

        maestro.use("services.cache", function(entries) {
          entries.should.be.an.Object.and.have.property('host', '198.172.64.45')
          done();
        })
      });
    });

    it("should run callback when service is set", function(done) {
      maestro.use("services.cache", function(entries) {
        entries.should.be.an.Object.and.have.property('host', '127.0.0.1')
        done();
      })

      maestro.client.set("services.cache", JSON.stringify({ host: '127.0.0.1', port: 6478 }));
    });

    it("should update service when the service entries change", function(done) {
      var service = null;

      maestro.client.set("services.api", JSON.stringify({ host: '127.0.0.1', port: 1234 }), function() {
        maestro.use("services.api", function(entries) {
          if (service == null) {
            entries.should.be.an.Object.and.have.property('port', 1234);
          } else {
            entries.should.be.an.Object.and.have.property('port', 4567);
            done();
          }

          service = entries;
        })

        setTimeout(function() {
          maestro.client.set("services.api", JSON.stringify({ host: '127.0.0.1', port: 4567 }));
        }, 10);
      });
    });
  });

  describe("on start()", function() {
    it("should start the service", function(done) {
      maestro.start(function() {
        done();
      })
    })

    it("should start the service after dependencies are resolved", function(done) {
      var cache = null;

      maestro.use("services.cache", function(entries) {
        cache = { endpoint: entries.host + ":" + entries.port };
      })

      maestro.start(function() {
        cache.should.be.an.Object.and.have.property('endpoint', '127.0.0.1:6478');
        done();
      })

      maestro.client.set("services.cache", JSON.stringify({ host: '127.0.0.1', port: 6478 }))
    })

    it("should not start twice if dependencies update", function(done) {
      var started = false;
      var cache = null;

      maestro.use("services.cache", function(entries) {
        cache = entries;
      })

      maestro.start(function() {
        if (started) {
          done(new Error("Service has already been started"));
        } else {
          started = true;
          maestro.client.set("services.cache", JSON.stringify({ value: 2 }));
          setTimeout(function() {
            cache.should.have.property("value", 2);
            done();
          }, 10);
        }
      })

      maestro.client.set("services.cache", JSON.stringify({ value: 1 }));
    })

    it("should register service", function(done) {
      maestro.register("services.api", {
        host: "localhost",
        username: "test",
        password: "test"
      });

      maestro.start(function() {
        setTimeout(function() {
          maestro.client.get("services.api", function(err, value) {
            var obj = JSON.parse(value);
            should(obj[0]).be.an.Object.have.property("host", "localhost");
            done();
          })
        }, 10)
      })
    })

    it("should register appending to previous service", function(done) {
      var maestro2 = new Maestro();
      maestro.register("services.api", { host: "host1" });
      maestro2.register("services.api", { host: "host2" });

      maestro.start(function() {

      });

      setTimeout(function() {
        maestro2.start(function() {
          setTimeout(function() {
            maestro.client.get("services.api", function(err, value) {
              var entries = JSON.parse(value);
              entries.length.should.be.exactly(2)
              entries[0].should.have.property("host", "host1")
              entries[1].should.have.property("host", "host2")
              maestro2.quit();
              done();
            })
          }, 5)
        });
      }, 5);
    })
  })

  describe("on quit()", function() {
    it("should close connection with Redis", function(done) {
      maestro.quit(function() {
        maestro.client.get("test", function(err, value) {
          err.should.be.Error
          done()
        })
      })
    })

    it("should remove service entry in Redis", function(done) {
      maestro.register("services.api", {
        host: "api.example.com"
      })

      maestro.start(function() {
        setTimeout(function() {
          maestro.quit(function() {
            maestro = new Maestro();
            maestro.client.get("services.api", function(err, value) {
              var entries = JSON.parse(value);
              should(entries.length).be.exactly(0);
              done();
            })
          })
        }, 10)
      })
    })

    it("should only remove correct entry", function(done) {
      var maestro2 = new Maestro();
      maestro.register("services.api", { host: "host1" });
      maestro2.register("services.api", { host: "host2" });

      maestro.start(function() { })
      maestro2.start(function() {
        setTimeout(function() {
          maestro.quit(function() {
            maestro2.client.get("services.api", function(err, value) {
              var entries = JSON.parse(value);
              should(entries.length).be.exactly(1);
              should(entries[0]).have.property('host', 'host2');
              maestro2.quit(function() {
                done();
              });
            })
          })
        }, 10);
      })
    })
  })
})
