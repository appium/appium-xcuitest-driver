/*
 * derived from jQuery Cookie Plugin v1.4.1
 * https://github.com/carhartl/jquery-cookie
 */

// needed to communicate/translate between JSONWire cookies and regular JavaScript cookies

import _ from 'lodash';
import { logger } from 'appium-support';


const log = logger.getLogger('Cookie');

// parses the value if needed and converts the value if a converter is provided
// internal function, not exported
function convertCookie (value, converter) {
  if (value.indexOf('"') === 0) {
    // this is a quoted cookied according to RFC2068
    // remove enclosing quotes and internal quotes and backslashes
    value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  let parsedValue;
  try {
    parsedValue = decodeURIComponent(value.replace(/\+/g, ' '));
  } catch (e) {
    // no need to fail if we can't decode
    log.warn(e);
  }

  return converter ? converter(parsedValue) : parsedValue;
}

// takes arguments given and creates a JavaScript Cookie
function createJSCookie (key, value, options = {}) {
  return [
    encodeURIComponent(key), '=', value,
    options.expires
      ? `; expires=${options.expires}`
      : '',
    options.path
      ? `; path=${options.path}`
      : '',
    options.domain
      ? `; domain=${options.domain}`
      : '',
    options.secure
      ? '; secure'
      : ''
  ].join('');
}

// takes the JavaScript cookieString and translates it into a JSONWire formatted cookie
function createJWPCookie (key, cookieString, converter = null) {
  let result = {};
  let cookies = cookieString ? cookieString.split('; ') : [];
  for (let cookie of cookies) {
    let parts = cookie.split('=');

    // get the first and second element as name and value
    let name = decodeURIComponent(parts.shift());
    let val = parts[0];

    // if name is key, this is the central element of the cookie, so add as `name`
    // otherwise it is an optional element
    if (key && key === name) {
      result.name = key;
      result.value = convertCookie(val, converter);
    } else {
      result[name] = convertCookie(val, converter);
    }
  }
  return result;
}

// takes a JavaScript cookiestring and parses it for the value given the key
function getValue (key, cookieString, converter = null) {
  let result = createJWPCookie(key, cookieString, converter);

  // if `key` is undefined we want the entire cookie
  return _.isUndefined(key) ? result : result.value;
}


// returns a cookie that expires on 01 Jan 1970
// assign the returned cookie to an existing cookie to delete that cookie
function expireCookie (key, options) {
  // override `expires` in `options`, and then make the cookie
  return createJSCookie(key, '', _.assign({}, options, {
    expires: 'Thu, 01 Jan 1970 00:00:00 GMT'
  }));
}

// export individually and also (as default) as an object
export { createJSCookie, createJWPCookie, getValue, expireCookie };
export default { createJSCookie, createJWPCookie, getValue, expireCookie };
