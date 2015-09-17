import _ from 'lodash';
import path from 'path';
import { spawn } from 'node-simctl';
import { JWProxy } from 'appium-jsonwp-proxy';
import { fs } from 'appium-support';

const BIN_PATH = path.resolve(__dirname, '..', '..', 'bin');
const REQ_ARGS = ['udid', 'platformVersion', 'host', 'port'];

class WebDriverAgent {

  constructor (args = {}) {
    for (let reqArg of REQ_ARGS) {
      if (_.isUndefined(args[reqArg])) {
        throw new Error(`You must send in the '${reqArg}' argument`);
      }
    }
    Object.assign(this, args);
  }

  async launch (sessionId) {
    let wda = path.resolve(BIN_PATH, `WebDriverAgent-${this.platformVersion}`);
    if (!await fs.exists(wda)) {
      throw new Error(`Trying to use WebDriverAgent binary at ${wda} but it ` +
                      `does not exist. Check your platformVersion?`);
    }
    this.jwproxy = new JWProxy({host: this.host, port: this.port});
    this.jwproxy.sessionId = sessionId;
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);
    await spawn(this.udid, wda);
    // TODO wait until we can prove the server is up and listening
  }
}

export default WebDriverAgent;
