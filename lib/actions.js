var debug = require('debug')('nightmare');
var async = require('async');
var filterFnStr = require('./utils/regex-filter').toString();
var fs = require('fs');

/**
 * Use a `plugin` function.
 *
 * We need to insert the plugin's functions at the beginning of the queue
 * and then replace all the later functions at the end.
 *
 * @param {Function} plugin
 * @param {Function} done
 * @return {Nightmare}
 */

exports.use = function(plugin, done){
  debug('.use()-ing a plugin');
  var cache = this.queue;
  this.queue = [];
  plugin(this);
  this.queue = this.queue.concat(cache);
  done();
};

/**
 * Go to a new url.
 *
 * @param {String} url
 * @param {Function} done
 */

exports.goto = function(url, done) {
  debug('.goto() url: ' + url);
  this.page.open(url, function(status) {
    debug('.goto() page loaded: ' + status);
    setTimeout(done, 500);
  });
};

/**
 * Go back.
 *
 */

exports.back = function(done) {
  debug('.back()');
  this.page.goBack();
  done();
};

/**
 * Go forward.
 *
 * @param {Function} done
 */

exports.forward = function(done) {
  debug('.forward()');
  this.page.goForward();
  done();
};

/**
 * Refresh the page.
 *
 * @param {Function} done
 */

exports.refresh = function(done) {
  debug('.refresh()-ing the page');
  this.page.evaluate(function(selector) {
    document.location.reload(true);
  }, done);
};

/**
 * Get the url of the page.
 *
 * @param {Function} callback
 * @param {Function} done
 */

exports.url = function(callback, done) {
  debug('.url() getting it');
  this.page.evaluate(function() {
    return document.location.href;
  }, function(url) {
    callback(url);
    done();
  });
};

/**
 * Get the title of the page.
 *
 * @param {Function} callback
 * @param {Function} done
 */

exports.title = function(callback, done) {
  debug('.title() getting it');
  this.page.evaluate(function() {
    return document.title;
  }, function(title) {
    callback(title);
    done();
  });
};

/**
 * Determine if a selector is visible on a page.
 *
 * @param {String} selector
 * @param {Function} callback
 * @param {Function} done
 */

exports.visible = function(selector, callback, done) {
  debug('.visible() for ' + selector);
  this.page.evaluate(function(selector) {
    var elem = document.querySelector(selector);
    if (elem) return (elem.offsetWidth > 0 && elem.offsetHeight > 0);
    else return false;
  }, function(result) {
    callback(result);
    done();
  }, selector);
};


/**
 * Determine if a selector exists on a page.
 *
 * @param {String} selector
 * @param {Function} callback
 * @param {Function} done
 */

exports.exists = function(selector, callback, done) {
  debug('.exists() for ' + selector);
  this.page.evaluate(function(selector) {
    return (document.querySelector(selector)!==null);
  }, function(result) {
    callback(result);
    done();
  }, selector);
};

/**
 * Inject a JavaScript or CSS file onto the page
 *
 * @param {String} type
 * @param {String} file
 * @param {Function} done
 */

exports.inject = function(file, done){
  debug('.inject()-ing js');
  this.page.injectJs(file, done);
};

/**
 * Click an element.
 *
 * @param {String} selector
 * @param {Function} done
 */

exports.click = function(/* args */) {
  // click(selector)
  // click(selector, callback)
  // click(selector, filter)
  // click(selector, filter, callback)
  
  var args = arguments;
  var selector = args[0];
  var cb = function() {};
  var filter;
  var done = args[args.length-1];

  if(args.length === 3 && typeof args[1] === 'function') {
    cb = args[1];
  } else if(args.length === 3) {
    filter = args[1];
  } else if(args.length === 4) {
    filter = args[1];
    cb = args[2];
  }

  debug('.click() on ' + selector);

  var self = this;
  self.page.evaluate(function (selector, filter, filterFnStr) {
    var element;
    
    if(filter) {
      var regexFilterFn = function(){ return true; };
      eval('var regexFilterFn = ' + filterFnStr);

      var filterFn = function(o) {
        return regexFilterFn(o.textContent, filter.regex);
      };

      var elements = [].slice.call(document.querySelectorAll(selector));
      elements = elements.filter(filterFn);
      element = elements[elements.length - 1];
    } else {
      element = document.querySelector(selector);  
    }

    if(element) {
      var event = document.createEvent('MouseEvent');
      event.initEvent('click', true, true);
      element.dispatchEvent(event);
      return;
    } else {
      return 'Element not found';
    }
  }, function(err) {
    cb(err);
    done();
  }, selector, filter, filterFnStr);
};

/**
 * Type into an element.
 *
 * @param {String} selector
 * @param {String} text
 * @param {Function} done
 */

exports.type = function(selector, text, done) {
  debug('.type() %s into %s', text, selector);
  
  var self = this;
  self.page.evaluate(function(selector, text){
    
    // click the element
    var element = document.querySelector(selector);

    if(element) {
      var event = document.createEvent('MouseEvent');
      event.initEvent('click', true, true);
      element.dispatchEvent(event);
      element.value = text;
    } else {
      return 'Element not found';
    }
  }, function(err) {
    if(err) {
      self.emit('error', new Error(err));
    }
    done();
  }, selector, text);
};

/**
 * Check a checkbox, fire change event
 *
 * @param {String} selector
 * @param {Function} done
 */

exports.check = function(selector, done) {
  debug('.check() ' + selector);
  this.page.evaluate(function(selector) {
    var element = document.querySelector(selector);
    var event = document.createEvent('HTMLEvents');
    element.checked = true;
    event.initEvent('change', true, true);
    element.dispatchEvent(event);

  }, done, selector);
};

/**
 * Choose an option from a select dropdown
 *
 *
 *
 * @param {String} selector
 * @param {String} option value
 * @param {Function} done
 */

exports.select = function(selector, option, done) {
  debug('.select() ' + selector);
  this.page.evaluate(function(selector, option) {
    var element = document.querySelector(selector);
    var event = document.createEvent('HTMLEvents');
    element.value = option;
    event.initEvent('change', true, true);
    element.dispatchEvent(event);
  }, done, selector, option);
};


/**
 * Scroll to the bottom of the page or a specific location
 *
 * @param {Number} Top
 */

exports.scrollTo = function(/* args */) {
  var args = arguments;
  var done = args[args.length-1];
  var top;
  
  if(args.length === 2) {
    top = args[0];
    debug('.scrollTo()', top);  
    this.page.evaluate(function(top) {
      window.document.body.scrollTop = top;  
    }, done, top);
  } 
  // the bottom
  else {
    debug('.scrollTo() the bottom');  
    this.page.evaluate(function() {
      window.document.body.scrollTop += 9999999;
    }, done);
  }
};

/**
 * Upload a path into a file input.
 *
 * @param {String} selector
 * @param {String} path
 * @param {Function} done
 */

exports.upload = function(selector, path, done) {
  debug('.upload() to ' + selector + ' with ' + path);
  if (fs.existsSync(path)) {
    this.page.uploadFile(selector, path, impatient(done, this.options.timeout));
  }
  else {
    debug('invalid file path for upload: %s', path);
    done(new Error('File does not exist to upload.'));
  }
};

/**
 * Wait for navigation or new elements
 *
 * @param {Array} elements
 * @param {Function} next
 */

 exports.waitForNewElementsOrNewPage = function(selectors, cb, done) {
   var self = this;
   var doneWaiting = false;
   
   selectors.push(1);

   async.some(selectors, function(item, done) {
     if(typeof item === 'number') {
       self.afterNextPageLoad(function(val) {
         if(doneWaiting) { return; }
         doneWaiting = true;
         done(true);
       });
     } else {
       self.waitForDomMutation(item, function(val) {
         if(doneWaiting) { return; }
         if(!val) self.emit('timeout', 'timeout elapsed before the dom mutated');
         doneWaiting = true;
         done(true);
       });
     }
   }.bind(self), function() {
      done();
   });
 };

/**
 * Wait for various states.
 *
 * @param {Null|Number|String|Function} condition
 */

exports.wait = function(/* args */) {
  var args = arguments;
  var done = args[args.length-1];
  var selector, selectors, fn, delay, value, ms;
  var self = this;

  if (args.length === 1) {
    debug('.wait() for the next page load');
    self.afterNextPageLoad(done);
  }
  else if (args.length === 2) {
    var condition = args[0];
    if (typeof condition === 'number') {
      debug('.wait() for ' + ms + 'ms');
      ms = condition;
      setTimeout(done, ms);
    }
    else if (typeof condition === 'string') {
      selector = condition;
      self.waitForElement(selector, done);
    }
    else if (condition instanceof Array) {
      selectors = condition;
      async.each(selectors, self.waitForElement.bind(self), done);
    }
  }
  else if (args.length === 3) {
    if(args[0] instanceof Array) {
      selectors = args[0].slice();
      // in order to add a second iterator type to the async.some call
      selectors.push(1);

      // block after first instance of done()
      var doneWaiting = false;

      async.some(selectors, function(item, done) {
        if(typeof item === 'number') {
          self.afterNextPageLoad(function() {
            if(doneWaiting) { return; }
            doneWaiting = true;
            done(true);
          });
        } else {
          self.waitForDomMutation(item, function(val) {
            if(doneWaiting) { return; }
            if(!val) self.emit('timeout', 'timeout elapsed before the dom mutated');
            doneWaiting = true;
            done(true);
          });
        }
      }.bind(self), function() {
        done();
      });
    }
    else {
      debug('.wait() for fn==' + value);
      fn = args[0];
      value = args[1];
      self.untilOnPage(fn, value, function (val) {
        if (val !== value) self.emit('timeout', 'timeout elapsed before fn===' + value);
        done(null, value);
      });
    }
  } 
  else if(args.length === 4) {
    debug('.wait() for fn==' + value + ' with refreshes every ' + delay);
    fn = args[0];
    value = args[1];
    delay = args[2];
    self.refreshUntilOnPage(fn, value, delay, function (val) {
      if (val !== value) self.emit('timeout', 'timeout elapsed before fn===' + value);
      done(null, value);
    });
  }
};

/**
 * Take a screenshot.
 *
 * @param {String} path
 * @param {Function} done
 */

exports.screenshot = function (path, done) {
  var formats = ['png', 'gif', 'jpeg', 'jpg', 'pdf'];
  var ext = path.substring(path.indexOf('.') + 1);
  if (!~formats.join(',').indexOf(ext)) {
    done(new Error('Must include file extension in `path`.'));
  }
  debug('.screenshot() saved to ' + path);
  this.page.render(path, done);
};

/**
 * Render a PDF.
 *
 * @param {String} path
 * @param {Function} done
 */

exports.pdf = function (path, done) {
  debug('.pdf() saved to ' + path);
  this.page.set('paperSize', {
    format: 'A4',
    orientation: 'portrait',
    margin: '2cm'
  });
  this.page.render(path, {format: 'pdf', quality: '100'}, done);
};

/**
 * Run the function on the page.
 *
 * @param {Function} func
 * @param {Function} callback
 * @param {...} args
 */

exports.evaluate = function (func, callback/**, arg1, arg2...*/) {
  // The last argument is the internal completion callback, but
  // "callback" is the external callback provided by the user.
  // We need to wrap them.
  var args = [].slice.call(arguments);
  var external = callback;
  var internal = args[args.length-1];
  var wrapped = function() {
    external.apply(null, arguments);
    internal();
  };
  args[1] = wrapped;
  debug('.evaluate() fn on the page');
  this.page.evaluate.apply(this.page, args);
};

/**
 * Set the viewport.
 *
 * @param {Number} width
 * @param {Number} height
 * @param {Function} done
 */

exports.viewport = function (width, height, done) {
  debug('.viewport() to ' + width + ' x ' + height);
  var viewport = { width: width, height: height };
  this.page.set('viewportSize', viewport, done);
};

/**
 * Set the zoom factor.
 *
 * @param {Number} zoomFactor
 * @param {Function} done
 */

exports.zoom = function (zoomFactor, done) {
  this.page.set('zoomFactor', zoomFactor, done);
};

/**
 * Handles onResourceRequested page event
 *
 * @param {Function} callback
 * @param {Function} done
 */
exports.onResourceRequested = function (callback, done) {
  var args = [].slice.call(arguments);
  args = args.slice(1, args.length-1); // callback OR callback with args
  this.page.onResourceRequested.apply(this.page, args);
  done();
};

/*
 * Sets up basic authentication.
 *
 * @param {String} user
 * @param {Function} password
 */

exports.authentication = function(user, password, done) {
  var self = this;
  this.page.get('settings', function(settings){
    settings.userName = user;
    settings.password = password;
    self.page.set('settings', settings, done);
  });
};

/**
 * Set the useragent.
 *
 * @param {String} useragent
 * @param {Function} done
 */

exports.agent =
exports.useragent = function(useragent, done) {
  debug('.useragent() to ' + useragent);
  this.page.set('settings.userAgent', useragent, done);
};

/**
 * Impatiently call the function after a timeout, if it hasn't been called yet.
 *
 * @param {Function} fn
 * @param {Number} timeout
 */

function impatient(fn, timeout) {
  var called = false;
  var wrapper = function() {
    if (!called) fn.apply(null, arguments);
    called = true;
  };
  setTimeout(wrapper, timeout);
  return wrapper;
}

/*
 * Sets the headers.
 * @param {Object} headers
 */

exports.headers = function(headers, done) {
  this.page.setHeaders(headers, done);
};
