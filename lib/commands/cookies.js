import _ from 'lodash';
import { errors } from 'appium/driver';
import cookieUtils from '../cookies';

let commands = {}, helpers = {}, extensions = {};

commands.getCookies = async function getCookies () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  // get the cookies from the remote debugger, or an empty object
  const cookies = await this.remote.getCookies() || {cookies: []};

  // the value is URI encoded, so decode it safely
  const decodedCookieValues = cookies.cookies.map((cookie) => {
    try {
      return decodeURI(cookie.value);
    } catch (error) {
      this.log.debug(`Cookie ${cookie.name} was not decoded successfully. Cookie value: ${cookie.value}`);
      this.log.warn(error);
      return undefined;
    }
  });

  // zip cookes with decoded value, removing undefined cookie values
  return _.zip(cookies.cookies, decodedCookieValues)
    .filter(([, value]) => !_.isUndefined(value))
    .map(([cookie, value]) => Object.assign({}, cookie, {value}));
};

commands.setCookie = async function setCookie (cookie) {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  cookie = _.clone(cookie);

  // { "name": "name", "type": "string", "description": "Cookie name." },
  // { "name": "value", "type": "string", "description": "Cookie value." },
  // { "name": "domain", "type": "string", "description": "Cookie domain." },
  // { "name": "path", "type": "string", "description": "Cookie path." },
  // { "name": "expires", "type": "number", "description": "Cookie expires." },
  // { "name": "session", "type": "boolean", "description": "True in case of session cookie." },
  // { "name": "httpOnly", "type": "boolean", "description": "True if cookie is http-only." },
  // { "name": "secure", "type": "boolean", "description": "True if cookie is secure." },
  // { "name": "sameSite", "$ref": "CookieSameSitePolicy", "description": "Cookie Same-Site policy." }

  // if `path` field is not specified, Safari will not update cookies as expected; eg issue #1708
  if (!cookie.path) {
    cookie.path = '/';
  }

  const jsCookie = cookieUtils.createJSCookie(cookie.name, cookie.value, {
    expires: _.isNumber(cookie.expiry) ? (new Date(cookie.expiry * 1000)).toUTCString() :
      cookie.expiry,
    path: cookie.path,
    domain: cookie.domain,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure
  });
  return await this.remote.setCookie(jsCookie);
};

commands.deleteCookie = async function deleteCookie (cookieName) {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  const cookies = await this.getCookies();
  const cookie = cookies.find((cookie) => cookie.name === cookieName);
  if (!cookie) {
    this.log.debug(`Cookie '${cookieName}' not found. Ignoring.`);
    return true;
  }

  await this._deleteCookie(cookie);
  return true;
};

commands.deleteCookies = async function deleteCookies () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  const cookies = await this.getCookies();
  for (const cookie of cookies) {
    await this._deleteCookie(cookie);
  }
  return true;
};

helpers._deleteCookie = async function _deleteCookie (cookie) {
  const url = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
  return await this.remote.deleteCookie(cookie.name, url);
};

Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
