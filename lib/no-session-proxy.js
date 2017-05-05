import { util } from 'appium-support';
import { JWProxy } from 'appium-base-driver';
import _ from 'lodash';
import log from './logger';

class NoSessionProxy extends JWProxy {
  constructor (opts = {}) {
    super(opts);
  }

  getUrlForProxy (url) {
    if (url === '') {
      url = '/';
    }
    const proxyBase = `${this.scheme}://${this.server}:${this.port}${this.base}`;
    let remainingUrl = '';
    if ((new RegExp('^/')).test(url)) {
      remainingUrl = url;
    } else {
      throw new Error(`Did not know what to do with url '${url}'`);
    }
    remainingUrl = remainingUrl.replace(/\/$/, ''); // can't have trailing slashes
    return proxyBase + remainingUrl;
  }

  async proxyReqRes (req, res) {
    let [response, body] = await this.proxy(req.originalUrl, req.method, req.body);
    res.headers = response.headers;
    res.set('Content-type', response.headers['content-type']);
    body = util.safeJsonParse(body);
    if (_.isString(body)) {
      log.warn(`The '${_.trunc(body, 300)}' response is not valid JSON object`);
    }
    res.status(response.statusCode).send(JSON.stringify(body));
  }
}

export { NoSessionProxy };
export default NoSessionProxy;