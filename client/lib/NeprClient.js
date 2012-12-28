/*jslint node: true */
'use strict';
var extractor = require('file-extractor')
    , request = require ('request')
    , os = require('os')
    , _ = require('underscore');

/**
 * Construct a new NeprClient.
 * @param : config
 */
function NeprClient (config){
  var self = this;
  // active extractors
  self.extractors = [];
  self.logger = config.logger;
  var post = [ config.serverconfig.url
    , 'data'
    , config.env
    , config.type
    , os.hostname() ].join('/');
  self.client = request.defaults({url: post, 'json': true});

  /**
   * handle wildcards in filenames
   * @param f: filename.
   * @param cb : callback when a matching file is found.
   * @param ctxt : callback invocation context.
   */
  self.wildcards = function (f, cb, ctxt){
    var starmatch = f.match(/(.*)\*.*/);
    if(!starmatch){
      return process.nextTick(function(){ cb.apply(ctxt,[f]); });
    }
    var basedirPath = starmatch[1].split(/\//);
    basedirPath.pop();
    var files = [];
    var finder = require('walkdir').find(basedirPath.join('/'));
    finder.on('file', function (file) {
      files.push(file);
    });
    finder.on('end', function(){
      self.logger.debug('selected files : ');
      files.filter(require('minimatch').filter(f, {matchBase: true}))
        .forEach(function (f){
          self.logger.debug(f);
          cb.apply(ctxt,[f]);
        });
    });
  };

  /**
   * throttled send method.
   */
  self.send = _.throttle(function sendPerfData (vars){
    var data = vars.lines.splice(0, vars.lines.length);
    var errors = vars.errors.splice(0, vars.errors.length);
    data = data.concat(errors);
    self.client.post({body:data}, function(err, res){
      if(err){
        self.logger.error(err);
        self.logger.error(res);
      }
    });
  }, config.throttle || 200);

}



/**
 * start watching files for modification,
 * send matching lines to NeprServer.
 */
NeprClient.prototype.start = function (remote){
  var self = this;
  //self.configVersion =  version;
  // remote config is ready lets play !
  //var remote = require(path.join(basedir, configVersion));
  Object.keys(remote).forEach(function (file) {
    var e = extractor({lines:[], errors:[], timer: null});
    self.extractors.push(e);
    self.logger.info(file + ' :');
    Object.keys(remote[file]).forEach(function (regexp){
      self.logger.info(' ✓ pattern : ' + regexp);
      e.matches(new RegExp(regexp), function(m,vars){
        remote[file][regexp](m,vars);
        self.send(vars);
      });
    });
    self.wildcards(file, e.watch, e);
  });
};

/**
 * stop watching files.
 * clear any file watcher.
 */
NeprClient.prototype.stop = function (){
  var self = this;
  self.extractors.forEach(function(e){
    e.close();
  });
  self.extractor.splice(0, 0);
  self.logger.info('stop watching');
};

module.exports = function(ac){
    return new NeprClient(ac);
};

