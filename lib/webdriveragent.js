import _ from 'lodash';
import path from 'path';
import url from 'url';
import request from 'request-promise';
import B from 'bluebird';
import { SubProcess } from 'teen_process';
import { JWProxy } from 'appium-jsonwp-proxy';
import { fs } from 'appium-support';
import log from './logger';
import { getLogger } from 'appium-logger';
import { systemLogExists } from './simulatorManagement.js';

const agentLog = getLogger('WebDriverAgent');
const AGENT_PATH = path.resolve(__dirname, '..', '..', 'WebDriverAgent', 'WebDriverAgent.xcworkspace');
const REQ_ARGS = ['sim', 'platformVersion', 'host'];
const AGENT_LOG_PREFIX = 'XCTStubApps[';
const AGENT_STARTED_REGEX = /ServerURLHere->(.*)<-ServerURLHere/;



class WebDriverAgent {

  // agentPath (optional): Path to WebdriverAgent Executable (inside WebDriverAgent.app)
  constructor (args = {}) {
    for (let reqArg of REQ_ARGS) {
      if (_.isUndefined(args[reqArg])) {
        throw new Error(`You must send in the '${reqArg}' argument`);
      }
    }

    if (args.agentPath) {
      log.info(`Custom agent path specified: ${args.agentPath}`);
    } else {
      log.info(`Using default agent`);
    }

    this.sim = args.sim;
    this.platformVersion = args.platformVersion;
    this.host = args.host;
    this.agentPath = args.agentPath || path.resolve(AGENT_PATH);
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
          agentLog.info(d);
        }
        if (e.length && d.indexOf(AGENT_LOG_PREFIX) > -1) {
          agentLog.error(e);
        }
      });
      this.simLogs.on('exit', (code) => {
        reject(new Error(`tailing of simulator log exited with code ${code}`));
        return;
      });

      this.xcodebuild = this.createXcodeBuildSubProcess();
      // this.xcodebuild.on('output', (d, e) => {
      //   log.warn(d, e);
      // });
      this.xcodebuild.on('exit', (code, signal) => {
        log.info(`xcodebuild exited with code ${code} and signal ${signal}`);
        if (!signal && code !== 0) {
          reject(new Error(`xcodebuild failed with code ${code}`));
          return;
        }
        this.quit();
      });

      this.xcodebuild.start();

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

  createXcodeBuildSubProcess () {

    let args = [
      '-workspace',
      this.agentPath,
      '-scheme',
      'XCTUITestRunner',
      '-destination',
      `id=${this.sim.udid}`,
      'test'
    ];

    return new SubProcess('xcodebuild', args);
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

    this.jwproxy.sessionId = null;

    await B.all(stops);
  }

  //Body must be object
  async sendCommandWithSession(command, body, method) {
    //TODO: Support post body
    log.info(`Sending command ${command} to WebDriverAgent with body ${JSON.stringify(body)} via method ${method}`);
    try {
      let commandurl = url.format(this.url) + 'session/' + this.jwproxy.sessionId + '/' + command;
      await request({
            url: commandurl,
            body: body ? body : {},
            method: method,
            json: true,
            resolveWithFullResponse: true
          })
          .then(function (response) {
            // Command succeeded...
            log.info(`Successfully processed command with response: ${response}`);
          })
          .catch(function (err) {
            // Command failed...
            log.warn(`Error while processing command: ${err}`);
          });
    } catch (err) {
      log.warn(`Error while processing command: ${err}`);
      throw err;
    }
  }
}

export default WebDriverAgent;
