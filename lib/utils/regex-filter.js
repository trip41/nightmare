/**
 * Export the regex `transform`
 */

module.exports = filter;

/**
 * The regex `filter` returns true if the 
 * str matches the regular expression
 *
 * @param {String} str
 * @param {Object} opts
 * @return {Function} plugin
 */

function filter(str, opts) {
  var regex, pattern, flags;

  if(typeof opts === 'string') {
    pattern = opts;
  } else if(typeof opts.pattern === 'string') {
    pattern = opts.pattern;
    flags = opts.flags;
  }
  var parsedRegex = pattern.match(/^\/?(.*?)(?:\/([igm]*))?$/);
  pattern = parsedRegex[1];
  flags = opts.flags || parsedRegex[2];
  regex = new RegExp(pattern, flags);

  return regex.test(str);
}