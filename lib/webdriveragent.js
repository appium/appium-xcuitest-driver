import _ from 'lodash';
import path from 'path';
import { spawnSubProcess } from 'node-simctl';
import { JWProxy } from 'appium-jsonwp-proxy';
import { fs } from 'appium-support';
import log from './logger';
import { getLogger } from 'appium-logger';
import { simBooted } from './simulatorManagement.js';

const agentLog = getLogger('WebDriverAgent');
const BIN_PATH = path.resolve(__dirname, '..', '..', 'bin');
const REQ_ARGS = ['udid', 'platformVersion', 'host'];



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
    this.agentPath = args.agentPath || path.resolve(BIN_PATH, `WebDriverAgent-${this.platformVersion}`);
  }

  async launch (sessionId) {
    log.info("Launching WebDriverAgent on the device");

    if (!await fs.exists(this.agentPath)) {
      throw new Error(`Trying to use WebDriverAgent binary at ${this.agentPath} but it ` +
                      `does not exist. Check your platformVersion?`);
    }

    if (!await simBooted(this.udid)) {
      log.errorAndThrow(new Error(`simulator ${this.udid} is not in 'booted' state`));
    }

    this.proc = await spawnSubProcess(this.udid, this.agentPath);
    this.proc.on('output', (d, e) => {
      // NSLog logs to stderr, so nothing hits stdout. *shrug*
      if (d.length) {
        agentLog.info(d);
      }
      if (e.length) {
        agentLog.info(e);
      }
    });

    let port;
    let startupDetector = (stdout, stderr) => {
      if (stderr.indexOf('WebDriverAgent started on port') > -1) {
        let r = /WebDriverAgent started on port (\d+)/;
        let match = r.exec(stderr);
        if (match) {
          port = match[1];
          log.info(`detected that WebDriverAgent is running on port ${port}`);
        } else {
          log.errorAndThrow(new Error('No port detected from WebDriverAgent'));
        }
        return true;
      }
    };
    await this.proc.start(startupDetector);
    this.port = port;

    this.jwproxy = new JWProxy({host: this.host, port: this.port, base: ''});
    this.jwproxy.sessionId = sessionId;
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);

  }
}

export default WebDriverAgent;
