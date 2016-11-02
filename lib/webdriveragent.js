import _ from 'lodash';
import path from 'path';
import url from 'url';
import B from 'bluebird';
import { SubProcess, exec } from 'teen_process';
import { JWProxy } from 'appium-base-driver';
import { fs } from 'appium-support';
import log from './logger';
import { getLogger } from 'appium-logger';
import { systemLogExists } from './simulator-management.js';
import { killAppUsingAppName } from './utils.js';

const agentLog = getLogger('WebDriverAgent');
const xcodeLog = getLogger('Xcode');
const iproxyLog = getLogger('iProxy');

const AGENT_PATH = path.resolve(__dirname, '..', '..', 'WebDriverAgent', 'WebDriverAgent.xcodeproj');
const BOOTSTRAP_PATH = path.resolve(__dirname, '..', '..', 'WebDriverAgent');
const AGENT_LOG_PREFIX = 'XCTStubApps[';
const AGENT_RUNNER_LOG_PREFIX = 'XCTRunner[';
const SIM_BRIDGE_LOG_PREFIX = 'CoreSimulatorBridge[';
const AGENT_STARTED_REGEX = /ServerURLHere->(.*)<-ServerURLHere/;
const LOG_STARTTIME_REGEX = /Built at (\w{3} [\d\s]\d \d{4} \d{2}:\d{2}:\d{2})/;
const REAL_DEVICE_LOGGER_PATH = 'idevicesyslog';

class WebDriverAgent {

  // agentPath (optional): Path to WebdriverAgent Executable (inside WebDriverAgent.app)
  constructor (args = {}) {
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
    this.realDeviceLogger = args.realDeviceLogger || REAL_DEVICE_LOGGER_PATH;
    this.wdaLocalPort = args.wdaLocalPort;
    this.iosLogAlreadyShown = args.showIOSLog;
    this.showXcodeLog = !!args.showXcodeLog;
    this.xcodeConfigFile = args.xcodeConfigFile;
    this.keychainPath = args.keychainPath;
    this.keychainPassword = args.keychainPassword;
  }

  async launch (sessionId) {
    log.info('Launching WebDriverAgent on the device');

    if (!await fs.exists(this.agentPath)) {
      throw new Error(`Trying to use WebDriverAgent project at '${this.agentPath}' but the ` +
                      'file does not exist');
    }

    // make sure that the WDA library has been built
    await this.checkForDependencies();

    //kill all hanging processes
    await this.killHangingProcesses();

    // start the logging process
    if (this.realDevice) {
      this.deviceLogs = await this.createRealDeviceLogsSubProcess();
    } else {
      this.deviceLogs = await this.createSimLogsSubProcess();
    }

    this.xcodebuild = await this.createXcodeBuildSubProcess();

    // start the xcodebuild process
    let agentUrl = await this.startXcodebuild();

    this.url = url.parse(agentUrl);

    this.url.hostname = 'localhost';
    if (this.realDevice) {
      let localport = this.wdaLocalPort || this.url.port;
      this.iproxy = this.createiProxySubProcess(localport, this.url.port);
      await this.startiproxy();
      this.url.port = localport;
    }

    this.setupProxy(sessionId);

    return agentUrl;
  }

  setupProxy (sessionId) {
    this.jwproxy = new JWProxy({server: this.url.hostname, port: this.url.port, base: ''});
    this.jwproxy.sessionId = sessionId;
    this.proxyReqRes = this.jwproxy.proxyReqRes.bind(this.jwproxy);
  }

  async checkForDependencies () {
    try {
      let carthagePath = await fs.which('carthage');
      log.debug(`Carthage found: ${carthagePath}`);
    } catch (err) {
      log.info('Carthage not found. Install using `brew install carthage`');
    }
    if (!await fs.hasAccess(`${this.bootstrapPath}/Carthage`)) {
      log.debug('Running WebDriverAgent bootstrap script to install dependencies');
      await exec('/bin/bash', ['Scripts/bootstrap.sh', '-d'], {cwd: this.bootstrapPath});
    }
    if (!await fs.hasAccess(`${this.bootstrapPath}/Resources`)) {
      log.debug('Creating WebDriverAgent resources directory');
      await fs.mkdir(`${this.bootstrapPath}/Resources`);
    }
    if (!await fs.hasAccess(`${this.bootstrapPath}/Resources/WebDriverAgent.bundle`)) {
      log.debug('Creating WebDriverAgent resource bundle directory');
      await fs.mkdir(`${this.bootstrapPath}/Resources/WebDriverAgent.bundle`);
    }
  }

  async createXcodeBuildSubProcess () {
    let cmd = 'xcodebuild';
    let args = [
      'build',
      'test',
      '-project', this.agentPath,
      '-scheme', 'WebDriverAgentRunner',
      '-destination', `id=${this.device.udid}`,
      '-configuration', 'Debug',
    ];

    if (this.realDevice) {
      cmd = path.resolve(__dirname, '..', '..', 'bin', 'run-xcodebuild.sh');
      args = [
        '--project', this.agentPath,
        '--scheme', 'WebDriverAgentRunner',
        '--destination', `id=${this.device.udid}`,
      ];
      if (this.xcodeConfigFile) {
        log.debug(`Using Xcode configuration file: '${this.xcodeConfigFile}'`);
        args.push('--xcode-config-file', `"${this.xcodeConfigFile}"`);
      }
      if (this.keychainPath && this.keychainPassword) {
        args.push('--keychain-path', this.keychainPath);
        args.push('--keychain-password', this.keychainPassword);
      }
    }

    log.debug(`Beginning test with command '${cmd} ${args.join(' ')}' ` +
              `in directory '${this.bootstrapPath}'`);
    let xcodebuild = new SubProcess(cmd, args, {cwd: this.bootstrapPath});

    let logXcodeOutput = this.showXcodeLog;
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

      // if we have an error we want to output the logs
      // otherwise the failure is inscrutible
      if (out.indexOf('Error Domain=') !== -1) {
        logXcodeOutput = true;
      }

      if (logXcodeOutput) {
        xcodeLog.info(out);
      }
    });

    return xcodebuild;
  }

  async createSimLogsSubProcess () {
    let args = [
      '-f',
      '-n', '0',
      path.resolve(this.device.getLogDir(), 'system.log')
    ];

    let logs = new SubProcess('tail', args);
    this.setupLogging(logs, 'Sim');
    return logs;
  }

  createiProxySubProcess (localport, deviceport) {
    log.debug(`Starting iproxy to forward traffic from local port ${localport} to device port ${deviceport} over USB`);
    return new SubProcess(`iproxy`, [localport, deviceport, this.device.udid]);
  }

  async createRealDeviceLogsSubProcess () {
    async function checkForLogger (logger) {
      // the logger can be the name of a program on the PATH
      // or a path to the program
      try {
        await fs.which(logger);
      } catch (err) {
        // not on the PATH, so see if it is an accessible path itself
        return await fs.exists(logger);
      }

      // no error thrown, so all is well
      return true;
    }

    if (this.realDeviceLogger.indexOf('deviceconsole') !== -1 && await fs.exists(this.realDeviceLogger)) {
      // the user might have passed in the directory for `deviceconsole`, in which case we want to
      // make sure we use the executable
      let stat = await fs.stat(this.realDeviceLogger);
      if (stat.isDirectory()) {
        log.warn(`Real device logger '${this.realDeviceLogger}' is a directory. Appending 'deviceconsole' executable`);
        this.realDeviceLogger = path.resolve(this.realDeviceLogger, 'deviceconsole');
      }
    }

    if (!await checkForLogger(this.realDeviceLogger)) {
      // we have no logger
      throw new Error(`Unable to find real device logging program '${this.realDeviceLogger}'`);
    }
    log.debug(`Using real device logger '${this.realDeviceLogger}'`);

    let logs = new SubProcess(this.realDeviceLogger, ['-u', this.device.udid]);
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

    if (this.realDevice && this.realDeviceLogger.indexOf('idevicesyslog') !== -1) {
      // we are using idevicesyslog, which sometimes cannot connect to the device
      // at which time the system will not be able to figure out that the process
      // has started
      logs.on('output', (stdout, stderr) => {
        let errorString = 'Could not start logger for udid';
        if (stdout.indexOf(errorString) !== -1 || stderr.indexOf(errorString) !== -1) {
          // unfortunately we have no way to stopping the process, so just log overtly
          let msg = `The real device logger '${this.realDeviceLogger}' was ` +
                    `unable to start log capture. Please try installing ` +
                    `'deviceconsole' ('npm install -g deviceconsole') and ` +
                    `specify the path to it using the 'realDeviceLogger' capability.`;
          log.error(msg);
        }
      });
    }

    if (!this.iosLogAlreadyShown) {
      logs.on('output', (stdout, stderr) => {
        let out = stdout || stderr;
        // make sure we are not reading logs from before this test run
        if (!loggingStarted && !shouldStartLogging(out)) {
          return;
        }
        if (isPertinentLogLine(out)) {
          for (let line of out.split("\n").filter(Boolean)) {
            agentLog.debug(`${prefix}: ${line}`);
          }
        }
      });
    }
  }

  async startXcodebuild () {
    // wrap the start procedure in a promise so that we can catch, and report,
    // any startup errors that are thrown as events
    return await new B(async (resolve, reject) => {
      this.xcodebuild.on('exit', (code, signal) => {
        log.info(`xcodebuild exited with code '${code}' and signal '${signal}'`);
        if (!signal && code !== 0) {
          return reject(new Error(`xcodebuild failed with code ${code}`));
        }
      });

      this.deviceLogs.on('exit', (code) => {
        let msg = `${this.realDevice ? 'System' : 'Simulator'} log exited with code '${code}'`;
        log.info(msg);
        if (code) {
          return reject(msg);
        }
      });

      try {
        let startTime = new Date();
        await this.xcodebuild.start();
        let agentUrl = await this.waitForStart(startTime);
        resolve(agentUrl);
      } catch (err) {
        let msg = `Unable to start WebDriverAgent: ${err}`;
        log.error(msg);
        return reject(msg);
      }
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
    let showWaitingMessage = true; // turn off logging once we have hit the end

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
          showWaitingMessage = false;
          return true;
        }
      }

      // periodically log, so it does not look like everything died
      lineCount++;
      let threshold = this.realDevice ? 5000 : 200;
      if (showWaitingMessage && lineCount % threshold === 0) {
        log.debug('Waiting for WebDriverAgent server to finish loading...');
      }

      return false;
    };

    log.info('Waiting for WebDriverAgent to start on device');
    await this.deviceLogs.start(startDetector);
    log.info(`WebDriverAgent started at url '${agentUrl}'`);

    return agentUrl;
  }

  async startiproxy () {
    return await new B(async (resolve, reject) => {
      this.iproxy.on('exit', (code) => {
        log.warn(`iproxy exited ${code ? 'with code ${code}' : ''}`);
        if (code) {
          return reject(new Error(`iproxy exited with code '${code}'`));
        }
      });
      this.iproxy.on('output', (stdout, stderr) => {
        let out = stdout || stderr;
        for (let line of out.split('\n')) {
          if (!line.length) continue;
          iproxyLog.debug(line);
        }
      });

      try {
        await this.iproxy.start(5000);
        resolve();
      } catch (err) {
        log.error(`Error starting iproxy: '${err.message}'`);
        reject('Unable to start iproxy. Is it installed?');
      }
    });
  }

  async killHangingProcesses () {
    log.debug('Killing hanging processes');
    await killAppUsingAppName(this.device.udid, `xcodebuild`);
    let procNames = this.realDevice ? [this.realDeviceLogger, 'iproxy']
                                    : ['tail', 'XCTRunner'];
    for (let proc of procNames) {
      await killAppUsingAppName(this.device.udid, proc);
    }
  }

  async quit () {
    log.info('Shutting down WebDriverAgent');
    let getStopPromises = (signal) => {
      let stops = [];
      if (this.xcodebuild && this.xcodebuild.proc) {
        stops.push(this.xcodebuild.stop(signal));
      }
      if (this.deviceLogs && this.deviceLogs.proc) {
        stops.push(this.deviceLogs.stop(signal));
      }
      if (this.iproxy && this.iproxy.proc) {
        stops.push(this.iproxy.stop(signal));
      }
      return stops;
    };

    if (this.jwproxy) {
      this.jwproxy.sessionId = null;
    }

    try {
      await B.all(getStopPromises());
    } catch (err) {
      if (err.message.indexOf('Process didn\'t end after') === -1) {
        throw err;
      }
      log.debug('WebDriverAgent process did not end in a timely fashion. ' +
                'Sending SIGHUP signal...');
      await B.all(getStopPromises('SIGHUP'));
    }
  }
}

export default WebDriverAgent;
