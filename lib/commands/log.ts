import type {EventEmitter} from 'node:events';

import type {LogDefRecord, AppiumServer, WSServer} from '@appium/types';
import type {Simulator} from 'appium-ios-simulator';
import {DEFAULT_WS_PATHNAME_PREFIX} from 'appium/driver.js';
import WebSocket, {WebSocketServer} from 'ws';

import {toLogEntry} from '../device/log/helpers.js';
import {IOSCrashLog} from '../device/log/ios-crash-log.js';
import {IOSDeviceLog} from '../device/log/ios-device-log.js';
import type {IOSLog} from '../device/log/ios-log.js';
import {IOSSimulatorLog} from '../device/log/ios-simulator-log.js';
import {SafariConsoleLog} from '../device/log/safari-console-log.js';
import {SafariNetworkLog} from '../device/log/safari-network-log.js';
import type {XCUITestDriver} from '../driver.js';
import {isEmpty} from '../utils/index.js';
import {BIDI_EVENT_NAME} from './bidi/constants.js';
import {makeLogEntryAddedEvent} from './bidi/models.js';
import {NATIVE_WIN} from './constants.js';
import type {LogEntry, LogListener} from './types.js';

export type DriverLogs = Record<
  'syslog' | 'crashlog' | 'safariConsole' | 'safariNetwork' | 'performance',
  IOSLog<any, any> | undefined
>;

/**
 * Determines the websocket endpoint based on the `sessionId`
 */
const WEBSOCKET_ENDPOINT = (sessionId: string): string =>
  `${DEFAULT_WS_PATHNAME_PREFIX}/session/${sessionId}/appium/device/syslog`;
const COLOR_CODE_PATTERN = /\u001b\[(\d+(;\d+)*)?m/g; // eslint-disable-line no-control-regex
const GET_SERVER_LOGS_FEATURE = 'get_server_logs';

type XCUITestDriverLogTypes = keyof typeof SUPPORTED_LOG_TYPES;

interface BiDiListenerProperties {
  type: string;
  srcEventName?: string;
  context?: string;
  entryTransformer?: (x: any) => LogEntry;
}

/**
 * @privateRemarks The return types for these getters should be specified
 */
const SUPPORTED_LOG_TYPES: LogDefRecord = {
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
    getter: (self) => {
      self.assertFeatureEnabled(GET_SERVER_LOGS_FEATURE);
      return self.log.unwrap().record.map(nativeLogEntryToSeleniumEntry);
    },
  },
};

const LOG_NAMES_TO_CAPABILITY_NAMES_MAP: Record<string, string> = {
  safariConsole: 'showSafariConsoleLog',
  safariNetwork: 'showSafariNetworkLog',
  enablePerformanceLogging: 'enablePerformanceLogging',
};

export const supportedLogTypes = SUPPORTED_LOG_TYPES;

/**
 * Extracts logs of the specified type from the logs container.
 *
 * @param logType - The type of log to extract
 * @param logsContainer - Container holding log objects
 * @returns The extracted logs
 * @throws {Error} If logs are not available or the log type is not found
 */
export async function extractLogs(
  this: XCUITestDriver,
  logType: XCUITestDriverLogTypes,
  logsContainer: Partial<Record<XCUITestDriverLogTypes, {getLogs(): Promise<any>}>> = {},
): Promise<any> {
  // make sure that we have logs at all
  // otherwise it's not been initialized
  if (isEmpty(logsContainer)) {
    throw new Error('No logs currently available. Is the device/simulator started?');
  }

  // If logs captured successfully send response with data, else send error
  const logObject = logsContainer[logType];
  if (logObject) {
    return await logObject.getLogs();
  }
  if (logType in LOG_NAMES_TO_CAPABILITY_NAMES_MAP) {
    throw new Error(
      `${logType} logs are not enabled. Make sure you've set a proper value ` +
        `to the 'appium:${LOG_NAMES_TO_CAPABILITY_NAMES_MAP[logType]}' capability.`,
    );
  }
  throw new Error(`No logs of type '${logType}' found. Supported log types are: ${Object.keys(SUPPORTED_LOG_TYPES)}.`);
}

/**
 * Starts capturing iOS system logs.
 *
 * Initializes and starts capturing syslog and crashlog. Optionally starts Safari console and network logs
 * if the corresponding capabilities are enabled.
 *
 * @returns `true` if syslog capture started successfully; `false` otherwise
 */
export async function startLogCapture(this: XCUITestDriver): Promise<boolean> {
  this.logs ??= {} as DriverLogs;
  if (this.logs.syslog !== undefined && this.logs.syslog.isCapturing) {
    this.log.warn('Trying to start iOS log capture but it has already started!');
    return true;
  }

  if (this.logs.syslog === undefined) {
    this.logs.crashlog = assignBiDiLogListener(
      this.eventEmitter,
      new IOSCrashLog({
        sim: this.device as Simulator,
        udid: this.isRealDevice() ? this.opts.udid : undefined,
        log: this.log,
        remoteXPCFacade: this.remoteXPCFacade,
      }),
      {
        type: 'crashlog',
      },
    )[0];
    this.logs.syslog = assignBiDiLogListener(
      this.eventEmitter,
      this.isRealDevice()
        ? new IOSDeviceLog({
            udid: this.opts.udid as string,
            showLogs: this.opts.showIOSLog,
            log: this.log,
            remoteXPCFacade: this.remoteXPCFacade,
          })
        : new IOSSimulatorLog({
            sim: this.device as Simulator,
            showLogs: this.opts.showIOSLog,
            iosSimulatorLogsPredicate: this.opts.iosSimulatorLogsPredicate,
            simulatorLogLevel: this.opts.simulatorLogLevel,
            log: this.log,
            iosSyslogFile: this.opts.iosSyslogFile,
          }),
      {
        type: 'syslog',
      },
    )[0];
    if (typeof this.opts.showSafariConsoleLog === 'boolean') {
      this.logs.safariConsole = assignBiDiLogListener(
        this.eventEmitter,
        new SafariConsoleLog({
          showLogs: this.opts.showSafariConsoleLog,
          log: this.log,
        }),
        {
          type: 'safariConsole',
        },
      )[0];
    }
    if (typeof this.opts.showSafariNetworkLog === 'boolean') {
      this.logs.safariNetwork = assignBiDiLogListener(
        this.eventEmitter,
        new SafariNetworkLog({
          showLogs: this.opts.showSafariNetworkLog,
          log: this.log,
        }),
        {
          type: 'safariNetwork',
        },
      )[0];
    }
    if (this.isFeatureEnabled(GET_SERVER_LOGS_FEATURE)) {
      this._bidiServerLogListener = assignBiDiLogListener(this.eventEmitter, this.log.unwrap(), {
        type: 'server',
        srcEventName: 'log',
        entryTransformer: nativeLogEntryToSeleniumEntry,
      })[1];
    }
  }

  let didStartSyslog = false;
  if (this.logs.syslog) {
    try {
      await this.logs.syslog.startCapture();
      didStartSyslog = true;
      this.eventEmitter.emit('syslogStarted', this.logs.syslog);
    } catch (err: any) {
      this.log.debug(err.stack);
      this.log.warn(`Continuing without capturing device logs: ${err.message}`);
    }
  }
  await this.logs.crashlog?.startCapture();

  return didStartSyslog;
}

/**
 * Starts an iOS system logs broadcast websocket.
 *
 * The websocket listens on the same host and port as Appium. The endpoint created is `/ws/session/:sessionId:/appium/syslog`.
 *
 * If the websocket is already running, this command does nothing.
 *
 * Each connected websocket listener will receive syslog lines as soon as they are visible to Appium.
 * @see https://appiumpro.com/editions/55-using-mobile-execution-commands-to-continuously-stream-device-logs-with-appium
 */
export async function mobileStartLogsBroadcast(this: XCUITestDriver): Promise<void> {
  const pathname = WEBSOCKET_ENDPOINT(this.sessionId as string);
  if (!isEmpty(await (this.server as AppiumServer).getWebSocketHandlers(pathname))) {
    this.log.debug(`The system logs broadcasting web socket server is already listening at ${pathname}`);
    return;
  }

  this.log.info(`Assigning system logs broadcasting web socket server to ${pathname}`);
  // https://github.com/websockets/ws/blob/master/doc/ws.md
  const wss = new WebSocketServer({
    noServer: true,
  });
  wss.on('connection', (ws, req) => {
    if (req) {
      const remoteIp = isEmpty(req.headers['x-forwarded-for'])
        ? req.connection?.remoteAddress
        : req.headers['x-forwarded-for'];
      this.log.debug(`Established a new system logs listener web socket connection from ${remoteIp}`);
    } else {
      this.log.debug('Established a new system logs listener web socket connection');
    }

    if (!this._syslogWebsocketListener) {
      this._syslogWebsocketListener = (logRecord: {message: string}) => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(logRecord.message);
        }
      };
    }
    this.logs.syslog?.on('output', this._syslogWebsocketListener);

    ws.on('close', (code: number, reason: Buffer) => {
      if (this._syslogWebsocketListener) {
        this.logs.syslog?.removeListener('output', this._syslogWebsocketListener);
        this._syslogWebsocketListener = null;
      }

      let closeMsg = 'System logs listener web socket is closed.';
      if (!isEmpty(code)) {
        closeMsg += ` Code: ${code}.`;
      }
      if (!isEmpty(reason)) {
        closeMsg += ` Reason: ${reason.toString()}.`;
      }
      this.log.debug(closeMsg);
    });
  });
  await (this.server as AppiumServer).addWebSocketHandler(pathname, wss as WSServer);
}

/**
 * Stops the syslog broadcasting websocket server previously started by `mobile: startLogsBroadcast`.
 *
 * If no websocket server is running, this command does nothing.
 */
export async function mobileStopLogsBroadcast(this: XCUITestDriver): Promise<void> {
  const pathname = WEBSOCKET_ENDPOINT(this.sessionId as string);
  if (isEmpty(await (this.server as AppiumServer).getWebSocketHandlers(pathname))) {
    return;
  }

  this.log.debug('Stopping the system logs broadcasting web socket server');
  await (this.server as AppiumServer).removeWebSocketHandler(pathname);
}

/**
 * Assigns a BiDi log listener to the given log emitter.
 *
 * https://w3c.github.io/webdriver-bidi/#event-log-entryAdded
 *
 * @template EE extends EventEmitter
 * @param logEmitter - The event emitter to attach the listener to
 * @param properties - Configuration for the BiDi listener
 * @returns A tuple containing the log emitter and the listener function
 */
export function assignBiDiLogListener<EE extends EventEmitter>(
  driverEventEmitter: EventEmitter,
  logEmitter: EE,
  properties: BiDiListenerProperties,
): [EE, LogListener] {
  const {type, context = NATIVE_WIN, srcEventName = 'output', entryTransformer} = properties;
  const listener: LogListener = (logEntry: LogEntry) => {
    const finalEntry = entryTransformer ? entryTransformer(logEntry) : logEntry;
    driverEventEmitter.emit(BIDI_EVENT_NAME, makeLogEntryAddedEvent(finalEntry, context, type));
  };
  logEmitter.on(srcEventName, listener);
  return [logEmitter, listener];
}

function nativeLogEntryToSeleniumEntry(x: any): LogEntry {
  const msg = isEmpty(x.prefix) ? x.message : `[${x.prefix}] ${x.message}`;
  return toLogEntry(msg.replace(COLOR_CODE_PATTERN, ''), x.timestamp ?? Date.now());
}
