import _ from 'lodash';
import path from 'path';
import url from 'url';
import B from 'bluebird';
import { SubProcess, exec } from 'teen_process';
import { JWProxy } from 'appium-base-driver';
import { fs } from 'appium-support';
import log from './logger';
import { getLogger } from 'appium-logger';
import { systemLogExists } from './simulatorManagement.js';


const agentLog = getLogger('WebDriverAgent');

const AGENT_PATH = path.resolve(__dirname, '..', '..', 'WebDriverAgent', 'WebDriverAgent.xcodeproj');
const BOOTSTRAP_PATH = path.resolve(__dirname, '..', '..', 'WebDriverAgent');
const REQ_ARGS = ['sim', 'platformVersion', 'host'];
const AGENT_LOG_PREFIX = 'XCTStubApps[';
const AGENT_STARTED_REGEX = /ServerURLHere->(.*)<-ServerURLHere/;

class WebDriverAgent {

  // agentPath (optional): Path to WebdriverAgent Executable (inside WebDriverAgent.app)
  constructor (args = {}) {
    (function checkRequiredParameters () {
      let missingArgs = [];
      for (let reqArg of REQ_ARGS) {
        if (_.isUndefined(args[reqArg])) {
          missingArgs.push(reqArg);
        }
      }
      if (missingArgs.length) {
        throw new Error(`You must send in the following required arguments: ${missingArgs.join(', ')}`);
      }
    })();

    if (args.agentPath) {
      log.info(`Custom agent path specified: ${args.agentPath}`);
    } else {
      log.info(`Using default agent: ${AGENT_PATH}`);
    }

    if (args.bootstrapPath) {
      log.info(`Custom bootstrap path specified: ${args.bootstrapPath}`);
    } else {
      log.info(`Using default bootstrap: ${BOOTSTRAP_PATH}`);
    }

    this.sim = args.sim;
    this.platformVersion = args.platformVersion;
    this.host = args.host;
    this.agentPath = args.agentPath || AGENT_PATH;
    this.bootstrapPath = args.bootstrapPath || BOOTSTRAP_PATH;
  }

  async launch (sessionId) {
    return new B(async (resolve, reject) => {
      log.info("Launching WebDriverAgent on the device");

      if (!await fs.exists(this.agentPath)) {
        reject(new Error(`Trying to use WebDriverAgent project at ${this.agentPath} but the ` +
                         `file does not exist`));
        return;
      }

      this.simLogs = this.createSimLogsSubProcess();
      this.simLogs.on('output', (d, e) => {
        if (d.length && d.indexOf(AGENT_LOG_PREFIX) > -1) {
          agentLog.info(`Sim: ${d}`);
        }
        if (e.length && d.indexOf(AGENT_LOG_PREFIX) > -1) {
          agentLog.error(`Sim: ${e}`);
        }
      });
      this.simLogs.on('exit', (code) => {
        reject(new Error(`tailing of simulator log exited with code ${code}`));
        return;
      });

      this.xcodebuild = this.createXcodeBuildSubProcess();
      this.xcodebuild.on('output', (d, e) => {
        // we want to pull out the log file that is created, and highlight it
        // for diagnostic purposes
        if (e.indexOf('Writing diagnostic log for test session to') !== -1) {
          // pull out the first line that begins with the path separator
          // which should be the line indicating the log file generated
          this.logLocation = _.first(_.remove(e.trim().split('\n'), (v) => v.indexOf(path.sep) === 0));
          log.debug(`Log file for xcodebuild test: ${this.logLocation}`);
        }
        // log output of xcodebuild, for debugging
        // log.info(d, e);
      });
      this.xcodebuild.on('exit', (code, signal) => {
        if (!code && signal === 'SIGTERM') {
          log.info(`xcodebuild exited with code '${code}' and signal '${signal}'`);
        }
        if (!signal && code !== 0) {
          reject(new Error(`xcodebuild failed with code ${code}`));
          return;
        }
        this.quit();
      });

      await this.checkForDependencies();

      await this.xcodebuild.start();

      // we have to wait for the sim to start before we can tail the log file
      await systemLogExists(this.sim);

      let agentUrl;
      let agentStartedOnDevice = this.simLogs.start((stdout) => {
        let match = AGENT_STARTED_REGEX.exec(stdout);
        if (match) {
          agentUrl = match[1];
          log.info(`detected that WebDriverAgent is running at url ${agentUrl}`);
          if (!agentUrl) {
            log.errorAndThrow(new Error('No url detected from WebDriverAgent'));
          }
          return true;
        }
      });

      log.info(`Waiting for WebDriverAgent to start on device`);
      await agentStartedOnDevice;
      log.info(`WebDriverAgent started at url ${agentUrl}`);

      this.url = url.parse(agentUrl);

      this.jwproxy = new JWProxy({host: this.url.hostname, port: this.url.port, base: ''});
      this.jwproxy.sessionId = sessionId;
      this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);

      return resolve(url);
    });
  }

  async checkForDependencies () {
    if (!await fs.hasAccess(this.bootstrapPath + "/Carthage")) {
      await exec('/bin/bash', ['Scripts/bootstrap.sh'], {cwd: this.bootstrapPath});
    }
  }

  createXcodeBuildSubProcess () {
    let args = [
      '-project',
      this.agentPath,
      '-scheme',
      'WebDriverAgentRunner',
      '-destination',
      `id=${this.sim.udid}`,
      'test'
    ];
    return new SubProcess('xcodebuild', args, {cwd: this.bootstrapPath});
  }

  createSimLogsSubProcess () {
    let args = [
      '-f',
      '-n',
      '0',
      path.resolve(this.sim.getLogDir(), 'system.log')
    ];

    return new SubProcess('tail', args);
  }

  async quit () {
    log.info('Shutting down WebDriverAgent');
    let stops = [];
    if (this.xcodebuild && this.xcodebuild.proc) {
      stops.push(this.xcodebuild.stop());
    }
    if (this.simLogs && this.simLogs.proc) {
      stops.push(this.simLogs.stop());
    }

    if (this.jwproxy) {
      this.jwproxy.sessionId = null;
    }

    await B.all(stops);
  }
}

export default WebDriverAgent;
