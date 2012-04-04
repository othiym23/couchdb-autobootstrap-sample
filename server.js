var net      = require('net')
  , path     = require('path')
  , fs       = require('fs')
  , carrier  = require('carrier')
  , spawn    = require('child_process').spawn
  , emitter  = require('events').EventEmitter
  , cradle   = require('cradle')
  ;

var couchdb;
var couchProcess;
var couchDir = path.join(__dirname, 'couchdb');

function isOpen(host, port, callback) {
    var isOpened = false;

    var conn = net.createConnection(port, host);

    var timeoutId = setTimeout(function () { onClose(); }, 250);
    var onClose = function () {
      clearTimeout(timeoutId);
      return callback(null, isOpened);
    };

    conn.on('error', function (err) {
      if (err.code !== 'ECONNREFUSED') console.error('unexpected error:', err);
    });

    conn.on('connect', function () {
      isOpened = true;
      conn.end();
    });

    conn.on('close', onClose);
}

function bootstrapCouch(callback) {
  path.exists(couchDir, function (exists) {
    if (!exists) {
      fs.mkdir(couchDir, '0700', function (err) {
        if (err) return callback(err);

        return startCouchDB(callback);
      });
    }
    else {
      return startCouchDB(callback);
    }
  });
}

function startCouchDB(callback) {
  isOpen('localhost', 5984, function (err, couchStarted) {
    if (err) {
      console.error('startup error:', err);
      return callback(err);
    }

    if (!couchStarted) {
      console.log('starting up service-specific couchdb instance');

      var couchOptions = ['-a', 'local.ini'];

      couchProcess = spawn('couchdb', couchOptions);

      var couchStdout = carrier.carry(couchProcess.stdout);
      var waiting = true;
      couchStdout.on('line', function (line) {
        console.log('[couchdb] ' + line);

        if (waiting && line.indexOf("[info] [<0.31.0>] Apache CouchDB has started on http://127.0.0.1:5984/") >= 0) {
          console.log('couchdb up and ready');

          // register a handler to help ensure couchdb is shut down cleanly
          process.on('exit', function () {
            if (couchProcess) couchProcess.kill();
          });

          waiting = false;
          return callback();
        }
      });

      var couchStderr = carrier.carry(couchProcess.stderr);
      couchStderr.on('line', function (line) {
        console.error('[couchdb] ' + line);
      });

      couchProcess.on('exit', function (code, signal) {
        couchProcess = null;
        console.error('couchdn exited with code', code, 'and signal', signal);
      });
    }
    else if (couchProcess) {
      return callback(new Error('tried to start couchdb twice'));
    }
    else {
      console.log('using already-running couchdb instance.');
      return callback();
    }
  });
}

bootstrapCouch(function (err) {
  if (err) {
    console.error('error starting couchdb:', err);
    return emitter.emit('error', err);
  }

  couchdb = new (cradle.Connection)().database('sample_db');
});
