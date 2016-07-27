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
const REQ_ARGS = ['device', 'platformVersion', 'host', 'realDevice'];
const AGENT_LOG_PREFIX = 'XCTStubApps[';
const AGENT_RUNNER_LOG_PREFIX = 'XCTRunner[';
const SIM_BRIDGE_LOG_PREFIX = 'CoreSimulatorBridge[';
const AGENT_STARTED_REGEX = /ServerURLHere->(.*)<-ServerURLHere/;
const LOG_STARTTIME_REGEX = /Built at (\w{3} \d{2} \d{4} \d{2}:\d{2}:\d{2})/;

class WebDriverAgent {

  // agentPath (optional): Path to WebdriverAgent Executable (inside WebDriverAgent.app)
  constructor (args = {}) {
    (function checkRequiredParameters (args) {
      let missingArgs = [];
      for (let reqArg of REQ_ARGS) {
        if (_.isUndefined(args[reqArg])) {
          missingArgs.push(reqArg);
        }
      }
      if (missingArgs.length) {
        throw new Error(`You must send in the following required arguments: ${missingArgs.join(', ')}`);
      }
    })(args);

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

    this.device = args.device;
    this.platformVersion = args.platformVersion;
    this.host = args.host;
    this.realDevice = !!args.realDevice;

    this.agentPath = args.agentPath || AGENT_PATH;
    this.bootstrapPath = args.bootstrapPath || BOOTSTRAP_PATH;
  }

  async launch (sessionId) {
    log.info('Launching WebDriverAgent on the device');

    if (!await fs.exists(this.agentPath)) {
      throw new Error(`Trying to use WebDriverAgent project at '${this.agentPath}' but the ` +
                      'file does not exist');
    }

    // make sure that the WDA library has been built
    await this.checkForDependencies();

    // start the logging process
    this.deviceLogs = this.realDevice ? this.createRealDeviceLogsSubProcess()
                                      : this.deviceLogs = this.createSimLogsSubProcess();

    this.xcodebuild = await this.createXcodeBuildSubProcess();

    // start the xcodebuild process
    let agentUrl = await this.startXcodebuild();

    this.setupProxy(sessionId, agentUrl);

    return agentUrl;
  }

  setupProxy (sessionId, agentUrl) {
    this.url = url.parse(agentUrl);
    this.jwproxy = new JWProxy({server: this.url.hostname, port: this.url.port, base: ''});
    this.jwproxy.sessionId = sessionId;
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);
  }

  async checkForDependencies () {
    if (!await fs.hasAccess(`${this.bootstrapPath}/Carthage`)) {
      await exec('/bin/bash', ['Scripts/bootstrap.sh'], {cwd: this.bootstrapPath});
    }
  }

  async createXcodeBuildSubProcess () {
    let args = [
      '-project', this.agentPath,
      '-scheme', 'WebDriverAgentRunner',
      '-sdk', this.realDevice ? 'iphoneos' : 'iphonesimulator',
      '-destination', `platform=${this.realDevice ? 'iOS' : 'iOS Simulator'},id=${this.device.udid}`,
      'test',
    ];
    if (this.realDevice) {
      args.push('CODE_SIGN_IDENTITY="iPhone Developer"');
      args.push('CODE_SIGNING_REQUIRED=YES');
    }
    let xcodebuild = new SubProcess('xcodebuild', args, {cwd: this.bootstrapPath});

    xcodebuild.on('output', (stdout, stderr) => {
      let out = stdout || stderr;
      // we want to pull out the log file that is created, and highlight it
      // for diagnostic purposes
      if (out.indexOf('Writing diagnostic log for test session to') !== -1) {
        // pull out the first line that begins with the path separator
        // which *should* be the line indicating the log file generated
        let logLocation = _.first(_.remove(out.trim().split('\n'), (v) => v.indexOf(path.sep) === 0));
        log.debug(`Log file for xcodebuild test: ${logLocation}`);
      }
      // log output of xcodebuild, for debugging
      // log.info(out);
    });

    return xcodebuild;
  }

  createSimLogsSubProcess () {
    let args = [
      '-f',
      '-n', '0',
      path.resolve(this.device.getLogDir(), 'system.log')
    ];

    let logs = new SubProcess('tail', args);
    this.setupLogging(logs, 'Sim');
    return logs;
  }

  createRealDeviceLogsSubProcess () {
    let logs = new SubProcess('idevicesyslog', ['-u', this.device.udid]);
    this.setupLogging(logs, 'Device');
    return logs;
  }

  setupLogging (logs, prefix) {
    let loggingStarted = !this.realDevice;
    let startTime = new Date();
    function shouldStartLogging (row) {
      let logRowParts = row.split(/\s+/);
      let logRowDate = new Date(`${startTime.getFullYear()} ${logRowParts[0]} ${logRowParts[1]} ${logRowParts[2]}`);
      loggingStarted = logRowDate.isAfter(startTime);
      return loggingStarted;
    }

    function isPertinentLogLine (line) {
      return line.length &&
            (line.indexOf(AGENT_LOG_PREFIX) !== -1 ||
             line.indexOf(AGENT_RUNNER_LOG_PREFIX) !== -1 ||
             line.indexOf(SIM_BRIDGE_LOG_PREFIX) !== -1);
    }

    logs.on('output', (stdout, stderr) => {
      let out = stdout || stderr;
      // make sure we are not reading logs from before this test run
      if (!loggingStarted && !shouldStartLogging(out)) {
        return;
      }
      if (isPertinentLogLine(out)) {
        agentLog.debug(`${prefix}: ${out.trim()}`);
      }
    });
  }

  async startXcodebuild () {
    // wrap the start procedure in a promise so that we can catch, and report,
    // any startup errors that are thrown as events
    return await new B(async (resolve, reject) => {
      this.xcodebuild.on('exit', (code, signal) => {
        log.info(`xcodebuild exited with code '${code}' and signal '${signal}'`);
        if (!signal && code !== 0) {
          return reject(`xcodebuild failed with code ${code}`);
        }
      });

      this.deviceLogs.on('exit', (code) => {
        let msg = `${this.realDevice ? 'System' : 'Simulator'} log exited with code '${code}'`;
        log.info(msg);
        if (code) {
          return reject(msg);
        }
      });

      let startTime = new Date();
      await this.xcodebuild.start();
      let agentUrl = await this.waitForStart(startTime);

      resolve(agentUrl);
    });
  }

  async waitForStart (startTime) {
    // we have to wait for the sim to start before we can tail the log file
    if (!this.realDevice) {
      await systemLogExists(this.device);
    }

    let agentUrl;
    let lineCount = 0;
    let reachedEnd = !this.realDevice; // simulator does not need to wait, since we are tailing

    let startDetector = (stdout) => {
      // on a real device there may already be system logs that need to be
      // passed before we get to the real startup logs, otherwise
      // we expect two lines, one after another
      //     Jul 20 13:03:57 iamPhone XCTRunner[296] <Warning>: Built at Jul 20 2016 13:03:50
      //     Jul 20 13:03:57 iamPhone XCTRunner[296] <Warning>: ServerURLHere->http://10.35.4.122:8100<-ServerURLHere
      if (!reachedEnd) {
        let dateMatch = LOG_STARTTIME_REGEX.exec(stdout);
        if (dateMatch) {
          let buildTime = new Date(dateMatch[1]);
          if (buildTime.isAfter(startTime)) {
            reachedEnd = true;
          }
        }
      }

      if (reachedEnd) {
        let match = AGENT_STARTED_REGEX.exec(stdout);
        if (match) {
          agentUrl = match[1];
          log.info(`Detected that WebDriverAgent is running at url '${agentUrl}'`);
          if (!agentUrl) {
            log.errorAndThrow(new Error('No url detected from WebDriverAgent'));
          }
          // check for (null) url (e.g., 'http://(null):8100'), which happens on real devices
          if (/(\(null\))/.test(agentUrl)) {
            let msg = `Unable to detect url from WebDriverAgent: ${agentUrl}. ` +
                      'Is the device on the same network as the server?';
            log.errorAndThrow(new Error(msg));
          }

          return true;
        }
      }

      // periodically log, so it does not look like everything died
      lineCount++;
      if (lineCount % 100 === 0) {
        log.debug('Waiting for WebDriverAgent server to finish loading...');
      }

      return false;
    };

    log.info('Waiting for WebDriverAgent to start on device');
    await this.deviceLogs.start(startDetector);
    log.info(`WebDriverAgent started at url '${agentUrl}'`);

    return agentUrl;
  }

  async quit () {
    log.info('Shutting down WebDriverAgent');
    let stops = [];
    if (this.xcodebuild && this.xcodebuild.proc) {
      stops.push(this.xcodebuild.stop());
    }
    if (this.deviceLogs && this.deviceLogs.proc) {
      stops.push(this.deviceLogs.stop());
    }

    if (this.jwproxy) {
      this.jwproxy.sessionId = null;
    }

    await B.all(stops);
  }
}

export default WebDriverAgent;
