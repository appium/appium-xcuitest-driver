import _ from 'lodash';
import B from 'bluebird';
import {DEFAULT_WS_PATHNAME_PREFIX} from 'appium/driver';
import {IOSCrashLog} from '../device-log/ios-crash-log';
import {IOSSimulatorLog} from '../device-log/ios-simulator-log';
import {IOSDeviceLog} from '../device-log/ios-device-log';
import log from '../logger';
import WebSocket from 'ws';
import SafariConsoleLog from '../device-log/safari-console-log';
import SafariNetworkLog from '../device-log/safari-network-log';

/**
 * Determines the websocket endpoint based on the `sessionId`
 * @param {string} sessionId
 * @returns {string}
 */
const WEBSOCKET_ENDPOINT = (sessionId) =>
  `${DEFAULT_WS_PATHNAME_PREFIX}/session/${sessionId}/appium/device/syslog`;

const GET_SERVER_LOGS_FEATURE = 'get_server_logs';

/**
 * @type {import('@appium/types').LogDefRecord}
 * @privateRemarks The return types for these getters should be specified
 */
const SUPPORTED_LOG_TYPES = {
  syslog: {
    description: 'System Logs - Device logs for iOS applications on real devices and simulators',
    getter: async (self) => await self.extractLogs('syslog', self.logs),
  },
  crashlog: {
    description: 'Crash Logs - Crash reports for iOS applications on real devices and simulators',
    getter: async (self) => await self.extractLogs('crashlog', self.logs),
  },
  performance: {
    description: 'Performance Logs - Debug Timelines on real devices and simulators',
    getter: async (self) => await self.extractLogs('performance', self.logs),
  },
  safariConsole: {
    description: 'Safari Console Logs - data written to the JS console in Safari',
    getter: async (self) => await self.extractLogs('safariConsole', self.logs),
  },
  safariNetwork: {
    description: 'Safari Network Logs - information about network operations undertaken by Safari',
    getter: async (self) => await self.extractLogs('safariNetwork', self.logs),
  },
  server: {
    description: 'Appium server logs',
    /**
     * @returns {AppiumServerLogEntry[]}
     */
    getter: (self) => {
      self.assertFeatureEnabled(GET_SERVER_LOGS_FEATURE);
      return log.unwrap().record.map((x) => ({
        timestamp: Date.now(),
        level: 'ALL',
        message: _.isEmpty(x.prefix) ? x.message : `[${x.prefix}] ${x.message}`,
      }));
    },
  },
};

/**
 * Log entry in the array returned by `getLogs('server')`
 * @typedef AppiumServerLogEntry
 * @property {number} timestamp
 * @property {'ALL'} level
 * @property {string} message
 */

export default {
  supportedLogTypes: SUPPORTED_LOG_TYPES,
  /**
   *
   * @param {XCUITestDriverLogTypes} logType
   * @param {Partial<Record<XCUITestDriverLogTypes,{getLogs(): Promise<any>}>>} [logsContainer]
   * @this {XCUITestDriver}
   */
  async extractLogs(logType, logsContainer = {}) {
    // make sure that we have logs at all
    // otherwise it's not been initialized
    if (_.isEmpty(logsContainer)) {
      throw new Error('No logs currently available. Is the device/simulator started?');
    }

    // If logs captured successfully send response with data, else send error
    const logObject = logsContainer[logType];
    const logs = logObject ? await logObject.getLogs() : null;
    if (logs) {
      return logs;
    }
    throw new Error(`No logs of type '${String(logType)}' found.`);
  },

  /**
   * @this {XCUITestDriver}
   */
  async startLogCapture() {
    this.logs = this.logs || {};
    if (!_.isUndefined(this.logs.syslog) && this.logs.syslog.isCapturing) {
      log.warn('Trying to start iOS log capture but it has already started!');
      return true;
    }
    if (_.isUndefined(this.logs.syslog)) {
      this.logs.crashlog = new IOSCrashLog({
        sim: this.device,
        udid: this.isRealDevice() ? this.opts.udid : undefined,
      });

      if (this.isRealDevice()) {
        this.logs.syslog = new IOSDeviceLog({
          udid: this.opts.udid,
          showLogs: this.opts.showIOSLog,
        });
      } else {
        this.logs.syslog = new IOSSimulatorLog({
          sim: this.device,
          showLogs: this.opts.showIOSLog,
          xcodeVersion: this.xcodeVersion,
          iosSimulatorLogsPredicate: this.opts.iosSimulatorLogsPredicate,
        });
      }
      this.logs.safariConsole = new SafariConsoleLog(!!this.opts.showSafariConsoleLog);
      this.logs.safariNetwork = new SafariNetworkLog(!!this.opts.showSafariNetworkLog);
    }

    let didStartSyslog = false;
    /** @type {Promise[]} */
    const promises = [
      (async () => {
        try {
          await this.logs.syslog.startCapture();
          didStartSyslog = true;
        } catch (err) {
          log.debug(err.stack);
          log.warn(`Continuing without capturing device logs: ${err.message}`);
        }
      })(),
      this.logs.crashlog.startCapture(),
      this.logs.safariConsole.startCapture(),
      this.logs.safariNetwork.startCapture(),
    ];
    await B.all(promises);

    return didStartSyslog;
  },

  /**
   * Starts an iOS system logs broadcast websocket.
   *
   * The websocket listens on the same host and port as Appium.  The endpoint created is `/ws/session/:sessionId:/appium/syslog`.
   *
   * If the websocket is already running, this command does nothing.
   *
   * Each connected webcoket listener will receive syslog lines as soon as they are visible to Appium.
   * @see https://appiumpro.com/editions/55-using-mobile-execution-commands-to-continuously-stream-device-logs-with-appium
   * @returns {Promise<void>}
   * @this {XCUITestDriver}
   */
  async mobileStartLogsBroadcast() {
    const pathname = WEBSOCKET_ENDPOINT(/** @type {string} */ (this.sessionId));
    if (
      !_.isEmpty(
        await /** @type {import('@appium/types').AppiumServer} */ (
          this.server
        ).getWebSocketHandlers(pathname),
      )
    ) {
      log.debug(
        `The system logs broadcasting web socket server is already listening at ${pathname}`,
      );
      return;
    }

    log.info(`Assigning system logs broadcasting web socket server to ${pathname}`);
    // https://github.com/websockets/ws/blob/master/doc/ws.md
    const wss = new WebSocket.Server({
      noServer: true,
    });
    wss.on('connection', (ws, req) => {
      if (req) {
        const remoteIp = _.isEmpty(req.headers['x-forwarded-for'])
          ? req.connection?.remoteAddress
          : req.headers['x-forwarded-for'];
        log.debug(`Established a new system logs listener web socket connection from ${remoteIp}`);
      } else {
        log.debug('Established a new system logs listener web socket connection');
      }

      if (_.isEmpty(this._syslogWebsocketListener)) {
        this._syslogWebsocketListener = (logRecord) => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(logRecord.message);
          }
        };
      }
      this.logs.syslog.on('output', this._syslogWebsocketListener);

      ws.on('close', (code, reason) => {
        if (!_.isEmpty(this._syslogWebsocketListener)) {
          this.logs.syslog.removeListener('output', this._syslogWebsocketListener);
          this._syslogWebsocketListener = null;
        }

        let closeMsg = 'System logs listener web socket is closed.';
        if (!_.isEmpty(code)) {
          closeMsg += ` Code: ${code}.`;
        }
        if (!_.isEmpty(reason)) {
          closeMsg += ` Reason: ${reason.toString()}.`;
        }
        log.debug(closeMsg);
      });
    });
    await /** @type {AppiumServer} */ (this.server).addWebSocketHandler(
      pathname,
      /** @type {import('@appium/types').WSServer} */ (wss),
    );
  },

  /**
   * Stops the syslog broadcasting wesocket server previously started by `mobile: startLogsBroadcast`.
   * If no websocket server is running, this command does nothing.
   * @this {XCUITestDriver}
   * @returns {Promise<void>}
   */
  async mobileStopLogsBroadcast() {
    const pathname = WEBSOCKET_ENDPOINT(/** @type {string} */ (this.sessionId));
    if (_.isEmpty(await /** @type {AppiumServer} */ (this.server).getWebSocketHandlers(pathname))) {
      return;
    }

    log.debug('Stopping the system logs broadcasting web socket server');
    await /** @type {AppiumServer} */ (this.server).removeWebSocketHandler(pathname);
  },
};

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 */

/**
 * @typedef {keyof typeof SUPPORTED_LOG_TYPES} XCUITestDriverLogTypes
 */

/**
 * @typedef {import('@appium/types').AppiumServer} AppiumServer
 */
