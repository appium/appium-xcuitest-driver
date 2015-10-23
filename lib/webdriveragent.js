import _ from 'lodash';
import path from 'path';
import { spawnSubProcess } from 'node-simctl';
import { JWProxy } from 'appium-jsonwp-proxy';
import { fs } from 'appium-support';
import log from './logger';

const BIN_PATH = path.resolve(__dirname, '..', '..', 'bin');
const REQ_ARGS = ['udid', 'platformVersion', 'host', 'port'];

class WebDriverAgent {

  // agentPath (optional): Path to WebdriverAgent Executable (inside WebDriverAgent.app)
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
    this.agentPath = args.agentPath || path.resolve(BIN_PATH, `WebDriverAgent-${this.platformVersion}`);
  }

  async launch (sessionId) {
    log.info("Launching WebDriverAgent on the device");

    if (!await fs.exists(this.agentPath)) {
      throw new Error(`Trying to use WebDriverAgent binary at ${this.agentPath} but it ` +
                      `does not exist. Check your platformVersion?`);
    }
    // TODO launch the sim based on udid, or check that it is launched
    this.jwproxy = new JWProxy({host: this.host, port: this.port, base: ''});
    this.jwproxy.sessionId = sessionId;
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);
    // TODO this should be converted to SubProcess in node-simctl and we can
    // then do all our usual subprocess handling on it. For now just launch it
    // out of band and then wait 2s
    log.info('about to call proc');
    this.proc = await spawnSubProcess(this.udid, wda);
    this.proc.on('output', (d, e) => {
      console.log('we gots data!', d, e);
    });
    await this.proc.start();
  }
}

export default WebDriverAgent;
