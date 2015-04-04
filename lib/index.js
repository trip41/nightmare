var phantom = require('phantom');
var debug = require('debug')('nightmare');
var defaults = require('defaults');
var clone = require('clone');
var async = require('async');
var once = require('once');
var actions = require('./actions');
var EventEmitter = require('events').EventEmitter;
var portfinder = require('portfinder');
var noop = function () {};

/**
 * Expose `Nightmare`.
 */

module.exports = Nightmare;

/**
 * Default options.
 *
 * http://phantomjs.org/api/command-line.html
 */

var DEFAULTS = {
  timeout: 5000,
  pageLoadTimeout: 10000,
  interval: 200,
  weak: true,
  loadImages: true,
  ignoreSslErrors: true,
  sslProtocol: 'any',
  proxy: null,
  proxyType: null,
  proxyAuth: null,
  cookiesFile: null,
  webSecurity: true
};

/**
 * Initialize a new `Nightmare`.
 *
 * @param {Object} options
 */

function Nightmare (options) {
  if (!(this instanceof Nightmare)) return new Nightmare(options);

  this.options = defaults(clone(options) || {}, DEFAULTS);
  this.queue = [];
  this.timeoutCount = 0;

  this.incrTimeout = function() {
    this.timeoutCount++;
  };

  this.on('timeout', this.incrTimeout);
}

/**
 * Global vars
 */

Nightmare.Errors = {
  ELEMENT_NOT_FOUND: 'Element not found',
};


/**
 * Inherit from event emitter
 */

Nightmare.prototype = Object.create(EventEmitter.prototype, {constructor: {value: Nightmare}});

/**
 * Run all the queued methods.
 *
 * @param {Function} callback
 */

Nightmare.prototype.run = function(callback) {
  var self = this;
  debug('run');
  this.setup(function () {
    setTimeout(next, 0);
    function next(err) {
      var item = self.queue.shift();
      if (!item) {
        self.teardownInstance();
        return (callback || noop)(err, self);
      }
      var method = item[0];
      var args = item[1];
      args.push(once(next));
      method.apply(self, args);

      // update listeners that there has been activity
      self.emit('ping');
    }
  });
};

/**
 * Set up a fresh phantomjs page.
 *
 * @param {Function} done
 * @api private
 */

Nightmare.prototype.setup = function(done) {
  var self = this;
  this.setupInstance(function(instance) {
    debug('.setup() phantom instance created');
    
    // notify any listeners that a phantom instance is running
    self.emit('ping');

    // kill phantom if the process is killed or there is an uncaught exception
    process.on('exit', self.killPhantomHard);
    process.on('uncaughtException', function() {
      self.killPhantom();
    });

    instance.createPage(function(page) {
      self.page = page;
      self.registerEventHandlers(page, function() {
        debug('.setup() phantom page created');
        done();        
      });
    });
  });
};

/**
 * Register event handlers on the page object
 *
 * @param {Function} done
 * @api private
 */

Nightmare.prototype.registerEventHandlers = function (page, done) {
  var self = this;

  var phantomEvents = [
    'alert',
    // 'closing', // crashes phantom 2
    'confirm',
    'consoleMessage',
    'error',
    'filePicker',
    'initialized',
    'loadFinished',
    'loadStarted',
    'navigationRequested',
    'pageCreated',
    'prompt',
    'resourceError',
    'resourceReceived',
    'resourceRequested',
    'resourceTimeout',
    'urlChanged'
  ];

  phantomEvents.forEach(function(phantomEvent) {
    var pageEvent = 'on' + phantomEvent.charAt(0).toUpperCase() + phantomEvent.slice(1);
    page.set(pageEvent, function() {
      var args = Array.prototype.slice.call(arguments);
      self.emit.apply(self, [phantomEvent].concat(args));
    });
  });

  done();
 };


/**
 * Safely set up a fresh phantomjs instance.
 *
 * @param {Function} done
 * @api private
 */

Nightmare.prototype.setupInstance = function(done) {
  debug('.setup() creating phantom instance with options %s', JSON.stringify(this.options));
  if (this.initializingPhantomJS) {
    var self = this;
    var check = setInterval(function() {
      if (self.phantomJS) {
        clearInterval(check);
        done(self.phantomJS);
      }
    }, 50);
  }
  else {
    this.initializingPhantomJS = true;
    this.createInstance(done);
  }
};

/**
 * Create a phantomjs instance.
 *
 * @param {Function} done
 * @api private
 */

Nightmare.prototype.createInstance = function(done) {
  var flags = [];
  flags.push('--load-images='+this.options.loadImages);
  flags.push('--ignore-ssl-errors='+this.options.ignoreSslErrors);
  flags.push('--ssl-protocol='+this.options.sslProtocol);
  flags.push('--web-security='+this.options.webSecurity);
  if (this.options.proxy !== null) {
    flags.push('--proxy='+this.options.proxy);
  }
  if (this.options.proxyType !== null) {
    flags.push('--proxy-type='+this.options.proxyType);
  }
  if (this.options.proxyAuth !== null) {
    flags.push('--proxy-auth='+this.options.proxyAuth);
  }
  if (this.options.cookiesFile !== null) {
    flags.push('--cookies-file='+this.options.cookiesFile);
  }

  // dnode options for compilation on windows
  var dnodeOpts = {};
  if (this.options.weak === false) {
     dnodeOpts = { weak : false };
  }

  // get a free port
  var self = this;
  portfinder.basePort = parseInt(13200 + Math.random() * 5000);
  portfinder.getPort(function(err, port) {
    debug('Starting phantom server on port %s', port);
    // combine flags, options and callback into args
    var args = flags;
    args.push({
      port: self.options.port || port,
      dnodeOpts: dnodeOpts,
      path: self.options.phantomPath,
      onExit: self.handleExit.bind(self)
    });
    args.push(function(instance) {
      self.phantomJS = instance;
      done(instance);
    });
    phantom.create.apply(phantom, args);

    // clear the timeout handler
    self.onTimeout = noop;    
  });
};

/**
 * Handle an unexpected exit
 *
 * @api private
 */

Nightmare.prototype.handleExit = function(code, signal) {
  this.phantomJS.process.removeAllListeners();
  this.phantomJS.process.kill('SIGKILL');

  // if non-zero code, emit the error
  if (code !== 0) {
    var error = new Error('The phantomjs process ended unexpectedly');
    error.code = code;
    error.signal = signal;
    this.emit('error', error);
  }

  // emit exit in all cases
  this.emit('exit', {
    code: code,
    signal: signal
  });
};

/**
 * Tear down a phantomjs instance.
 *
 * @api private
 */

Nightmare.prototype.teardownInstance = function() {
  debug('.teardownInstance() tearing down');

  this.initializingPhantomJS = false;
  this.phantomJS.exit(0);

  this.removeListener('timeout', this.incrTimeout);
};

/**
 * Kill the phantom process
 *
 * @api public
 */

Nightmare.prototype.killPhantom = function(cb) {
  cb = cb || function(){};
  
  this.removeListener('timeout', this.incrTimeout);

  if(this.phantomJS) { 
    this.phantomJS.exit(0);
    // this.once('exit', cb);
  } else {
    cb();
  }
};

/**
 * Kill the phantom process
 *
 * @api public
 */

Nightmare.prototype.killPhantomHard = function() {
  if(this.phantomJS) { 
    this.phantomJS.process.kill('SIGKILL');
  }
};

/**
 * Check function on page until it becomes true.
 *
 * @param {Function} check
 * @param {Object} value
 * @param {Number} delay
 * @param {Function} then
 * @api private
 */

Nightmare.prototype.refreshUntilOnPage = function(check, value, delay, then) {
  var page = this.page;
  debug('.wait() checking for condition after refreshing every ' + delay);
  var interval = setInterval(function() {
    page.evaluate(check, function(result) {
      if (result === value) {
        debug('.wait() saw value match after refresh');
        clearInterval(interval);
        then();
      }
      else {
        debug('.wait() refreshing the page (no match on value=' + result + ')');
        page.evaluate(function() {
          document.location.reload(true);
        });
      }
    });
  }, delay);
};

/**
 * Trigger the callback after the next page load.
 *
 * @param {Function} done
 * @api private
 */

Nightmare.prototype.afterNextPageLoad = function(done, onDomMutation) {
  var self = this;

  self.onLoadFinished = function loadFinished() {
    clearTimeout(self.pageLoadTimeoutToken);
    setTimeout(function() {
      done({ condition: true });
    }, 500);
  };

  clearTimeout(self.pageLoadTimeoutToken);
  self.pageLoadTimeoutToken = setTimeout(function() {
    self.removeListener('loadFinished', self.onLoadFinished);

    if(!onDomMutation) {
      self.emit('timeout', 'timeout elapsed before next page loaded');  
    }
    done({ condition: false });
  }, self.options.pageLoadTimeout);

  self.once('loadFinished', self.onLoadFinished);
};

/**
 * Wait for an element on the page
 *
 * @selector {String} selector
 * @param {Function} callback
 * @api private
 */

Nightmare.prototype.xwaitForElement = function(selector, done) {
  debug('.wait() for the element ' + selector);
  var self = this;
  // we lose the clojure when it goes to phantom, so we have to
  // force it with string concatenation and eval
  var elementPresent = function() { return true; };
  eval("var elementPresent = function() {"+
  "  try {"+
  "    var element = document.querySelector('"+selector+"');"+
  "    return (element ? true : false);"+
  "  } catch(e) { return false; }"+
  "};");

  this.untilOnPage(elementPresent, true, function (present) {
    if (!present) {
      self.emit('timeout', 'timeout elapsed before selector "' + selector + '" became present');
      return done(false);
    } else {
      return done(true);  
    }
  }, selector);
};

/**
 * Wait for an element on the page
 *
 * @selector {String} selector
 * @param {Function} callback
 * @api private
 */

Nightmare.prototype.waitForElement = function(selector, done) {
  debug('.wait() for the element ' + selector);
  var self = this;

  var elementPresent = function(next) {
    self.page.evaluate(function (selector) { 
      try {
        var element = document.querySelector(selector);
        return { result: (element ? true : false) };
      } catch(e) {
        return { error: 'Invalid selector', result: false };
      }
    }, function (res) {
      next({
        error: res.error,
        condition: res.result
      });
    }, selector);
  };

  untilAsync(elementPresent, this.options.timeout, this.options.interval, done);
};

/**
 * Wait for a dom mutation event against the selectors
 *
 * @selector {String} selector
 * @param {Function} callback
 * @api private
 */

Nightmare.prototype.waitForDomMutation = function(selector, prev, done) {
  debug('.wait() for dom mutation');
  
  var page = this.page;
  
  var moreMatchingElements = function(next) {
    page.evaluate(getDomDataForSelector, function (res) {
      var condition = prev && res.result !== prev;
      if(condition) { debug('found mutated elements', prev?prev.length:0, res.result?res.result.length:0); }
      prev = res.result;
      next({
        error: res.error,
        condition: condition
      });
    }, selector);
  };

  untilAsync(moreMatchingElements, this.options.pageLoadTimeout, this.options.interval, done);
};

/**
 * Get the state of the dom for given selectors
 *
 * @param {Array} selectors
 * @param {Function} done
 */

Nightmare.prototype.getDomState = function(selectors, done) {
  var page = this.page;
  var domState = [];
  
  async.each(selectors, function(selector, next) {
    page.evaluate(getDomDataForSelector, function (res) {
      if(res.error) { return next(res.error); }
      domState.push(res.result);
      next();
    }, selector);
  }, function(err) {
    if(err) {
      return done(err);
    } else {
      return done(null, domState);
    }
  });
};

/**
 * Check function on page until it becomes true.
 *
 * @param {Function} check
 * @param {Object} value
 * @param {Function} then
 * @api private
 */

Nightmare.prototype.untilOnPage = function(check, value, then) {
  var page = this.page;
  var condition = false;
  var args = [].slice.call(arguments).slice(3);
  var hasCondition = function() {
    args.unshift(function(res) {
      condition = res;
    });
    args.unshift(check);
    page.evaluate.apply(page, args);
    return condition === value;
  };

  until(hasCondition, this.options.timeout, this.options.interval, then);
};

/**
 * Check function until it becomes true.
 *
 * @param {Function} check
 * @param {Number} timeout
 * @param {Number} interval
 * @param {Function} then
 */

function until(check, timeout, interval, then) {
  var start = Date.now();
  var checker = setInterval(function() {
    var diff = Date.now() - start;
    var res = check();
    if (res || diff > timeout) {
      clearInterval(checker);
      then(res);
    }
  }, interval);
}

/**
 * Check function until it becomes true.
 *
 * @param {Function} check
 * @param {Number} timeout
 * @param {Number} interval
 * @param {Function} then
 */

function untilAsync(check, timeout, interval, done) {
  var start = Date.now();
  var checker = setInterval(function() {
    var diff = Date.now() - start;
    check(function(res) {
      if (res.condition || diff > timeout) {
        clearInterval(checker);
        done(res);
      }
    });
  }, interval);
}
  
/**
 * Get the aggregate dom data for a selector
 *
 * @param {String} selector
 * @return {Object} res
 */

function getDomDataForSelector(selector) {
  try {
    var elements = Array.prototype.slice.call(document.querySelectorAll(selector));
    var data = [];
    elements.forEach(function(element) {
      data.push(element.outerHTML);
    });
    return { result: data.join('') };
  } catch(e) {
    return { error: 'Invalid selector', result: '' };
  }      
}

/**
 * Attach all the actions.
 */

Object.keys(actions).forEach(function (name) {
  var fn = actions[name];
  Nightmare.prototype[name] = function() {
    debug('queueing action "' + name + '"');
    var args = [].slice.call(arguments);
    this.queue.push([fn, args]);
    return this;
  };
});