import _ from 'lodash';
import log from '../logger';
import { errors } from 'appium-base-driver';


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
      log.debug(`Cookie ${cookie.name} was not decoded successfully. Cookie value: ${cookie.value}`);
      log.warn(error);
      return undefined;
    }
  });

  // zip cookes with decoded value, removing undefined cookie values
  return _.zip(cookies.cookies, decodedCookieValues)
    .filter(([, value]) => !_.isUndefined(value))
    .map(([cookie, value]) => Object.assign({}, cookie, {value}));
};

commands.deleteCookie = async function deleteCookie (cookieName) {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  const cookies = await this.getCookies();
  const cookie = cookies.find((cookie) => cookie.name === cookieName);
  if (!cookie) {
    log.debug(`Cookie '${cookieName}' not found. Ignoring.`);
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
