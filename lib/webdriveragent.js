import _ from 'lodash';
import B from 'bluebird';
import path from 'path';
import { spawn } from 'node-simctl';
import { JWProxy } from 'appium-jsonwp-proxy';
import { fs } from 'appium-support';
import log from './logger';

const BIN_PATH = path.resolve(__dirname, '..', '..', 'bin');
const REQ_ARGS = ['udid', 'platformVersion', 'host', 'port'];

class WebDriverAgent {

  constructor (args = {}) {
    for (let reqArg of REQ_ARGS) {
      if (_.isUndefined(args[reqArg])) {
        throw new Error(`You must send in the '${reqArg}' argument`);
      }
    }

    this.udid = args.udid;
    this.platformVersion = args.platformVersion;
    this.host = args.host;
    this.port = args.port;
    this.agentPath = args.agentPath || BIN_PATH;
  }

  async launch (sessionId) {
    log.info("Launching WebDriverAgent on the device");
    let wda = path.resolve(this.agentPath, `WebDriverAgent-${this.platformVersion}`);
    if (!await fs.exists(wda)) {
      throw new Error(`Trying to use WebDriverAgent binary at ${wda} but it ` +
                      `does not exist. Check your platformVersion?`);
    }
    // TODO launch the sim based on udid, or check that it is launched
    this.jwproxy = new JWProxy({host: this.host, port: this.port, base: ''});
    this.jwproxy.sessionId = sessionId;
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);
    // TODO this should be converted to SubProcess in node-simctl and we can
    // then do all our usual subprocess handling on it. For now just launch it
    // out of band and then wait 2s
    spawn(this.udid, wda, {PORT_OFFSET: this.port - 8100});
    await B.delay(2000);
  }
}

export default WebDriverAgent;
