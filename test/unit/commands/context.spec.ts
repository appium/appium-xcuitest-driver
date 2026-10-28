import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it} from 'node:test';

import {RemoteDebugger} from 'appium-remote-debugger';

import {BIDI_EVENT_NAME, LOG_ENTRY_ADDED_EVENT} from '../../../lib/commands/bidi/constants.js';
import type {LogEntryAddedEvent} from '../../../lib/commands/bidi/types.js';
import {assignBiDiLogListener} from '../../../lib/commands/log.js';
import type {IOSPerformanceLog} from '../../../lib/device/log/ios-performance-log.js';
import {SafariConsoleLog} from '../../../lib/device/log/safari-console-log.js';
import {SafariNetworkLog} from '../../../lib/device/log/safari-network-log.js';
import {XCUITestDriver} from '../../../lib/driver.js';
import {AtomsBackend} from '../../../lib/web-execution/atoms-backend.js';
import {AutomationSessionBackend} from '../../../lib/web-execution/automation-session-backend.js';

describe('context', function () {
  describe('_webExecutionBackend', function () {
    it('returns an AtomsBackend when there is no remote debugger connection', function () {
      const driver = new XCUITestDriver({} as any);
      driver._remote = null;
      assert.strictEqual(driver._webExecutionBackend instanceof AtomsBackend, true);
    });

    it('returns an AtomsBackend when no automation session has been started', function () {
      const driver = new XCUITestDriver({} as any);
      driver._remote = {automationSession: {isStarted: false}} as any;
      assert.strictEqual(driver._webExecutionBackend instanceof AtomsBackend, true);
    });

    it('returns an AutomationSessionBackend once an automation session has started', function () {
      const driver = new XCUITestDriver({} as any);
      const fakeSession = {isStarted: true};
      driver._remote = {automationSession: fakeSession} as any;
      assert.strictEqual(driver._webExecutionBackend instanceof AutomationSessionBackend, true);
    });

    it('routes through the automation-session backend even when curContext is native', function () {
      // Session lifecycle is independent of curContext: switching to native does not
      // implicitly stop it, and the getter does not gate on isWebContext() itself.
      const driver = new XCUITestDriver({} as any);
      driver.curContext = null;
      driver._remote = {automationSession: {isStarted: true}} as any;
      assert.strictEqual(driver._webExecutionBackend instanceof AutomationSessionBackend, true);
    });

    it('constructs a fresh backend instance on every access rather than caching one on the driver', function () {
      // Backends are stateless wrappers; not caching them avoids the driver holding a
      // permanent reference back to itself through a cached backend field.
      const driver = new XCUITestDriver({} as any);
      driver._remote = null;
      assert.notStrictEqual(driver._webExecutionBackend, driver._webExecutionBackend);
    });

    it('re-evaluates on every access, resuming the automation-session backend after a native detour', function () {
      const driver = new XCUITestDriver({} as any);
      const fakeSession = {isStarted: true};
      driver._remote = {automationSession: fakeSession} as any;
      assert.strictEqual(driver._webExecutionBackend instanceof AutomationSessionBackend, true);

      fakeSession.isStarted = false;
      assert.strictEqual(driver._webExecutionBackend instanceof AtomsBackend, true);

      fakeSession.isStarted = true;
      assert.strictEqual(driver._webExecutionBackend instanceof AutomationSessionBackend, true);
    });
  });

  describe('setContext', function () {
    for (const method of [
      'Network.requestWillBeSent',
      'Network.responseReceived',
      'Network.loadingFinished',
      'Network.loadingFailed',
      'Network.dataReceived',
    ]) {
      const monitored = method !== 'Network.dataReceived';
      it(`${monitored ? 'records and broadcasts' : 'ignores'} ${method} through the network listener`, async function () {
        const driver = new XCUITestDriver({} as any);
        driver.curContext = null;
        driver.contexts = ['5191.1'];
        const networkEvents = new EventEmitter();
        driver._remote = {
          selectPage: async () => {},
          startNetwork: (listener: Parameters<RemoteDebugger['startNetwork']>[0]) => {
            networkEvents.on('NetworkEvent', listener);
          },
          stopNetwork: () => {
            networkEvents.removeAllListeners('NetworkEvent');
          },
        } as any;
        const networkLog = new SafariNetworkLog({showLogs: false, log: driver.log});
        driver.logs.safariNetwork = assignBiDiLogListener(driver.eventEmitter, networkLog, {
          type: 'safariNetwork',
        })[0];
        const bidiEvents: LogEntryAddedEvent[] = [];
        driver.eventEmitter.on(BIDI_EVENT_NAME, (event: LogEntryAddedEvent) => {
          if (event.method === LOG_ENTRY_ADDED_EVENT) {
            bidiEvents.push(event);
          }
        });

        await driver.setContext('WEBVIEW_5191.1');
        assert.strictEqual(networkEvents.listenerCount('NetworkEvent'), 1);
        const entry = {requestId: 'request-1', timestamp: 42};
        // The remote debugger supplies the original method as the third argument.
        networkEvents.emit('NetworkEvent', undefined, entry, method);

        const expected = monitored ? [{method, event: entry}] : [];
        const logs = await driver.extractLogs('safariNetwork', driver.logs);
        assert.deepStrictEqual(
          logs.map((log: {message: string}) => JSON.parse(log.message)),
          expected,
        );
        assert.deepStrictEqual(
          bidiEvents.map(({params}) => JSON.parse(params.text)),
          expected,
        );
        for (const {params} of bidiEvents) {
          assert.strictEqual(params.type, 'safariNetwork');
        }
      });
    }

    describe('repeated webview switches', function () {
      /**
       * Builds a driver wired to a real RemoteDebugger whose RPC client is a bare
       * EventEmitter, so the real startConsole/startNetwork/startTimeline listener
       * bookkeeping runs and listener counts can be inspected directly.
       */
      function buildDriver() {
        const driver = new XCUITestDriver({} as any);
        driver.curContext = null;
        driver.contexts = ['5191.1', '5191.2'];
        driver.opts.enablePerformanceLogging = true;

        const rpcClient = Object.assign(new EventEmitter(), {
          isConnected: true,
          selectPage: async () => {},
          send: async () => {},
        });
        const remote = new RemoteDebugger({log: driver.log} as any);
        (remote as any)._rpcClient = rpcClient;
        driver._remote = remote;

        driver.logs.safariConsole = assignBiDiLogListener(
          driver.eventEmitter,
          new SafariConsoleLog({showLogs: false, log: driver.log}),
          {type: 'safariConsole'},
        )[0];
        driver.logs.safariNetwork = assignBiDiLogListener(
          driver.eventEmitter,
          new SafariNetworkLog({showLogs: false, log: driver.log}),
          {type: 'safariNetwork'},
        )[0];

        const bidiEvents: LogEntryAddedEvent[] = [];
        driver.eventEmitter.on(BIDI_EVENT_NAME, (event: LogEntryAddedEvent) => {
          if (event.method === LOG_ENTRY_ADDED_EVENT) {
            bidiEvents.push(event);
          }
        });
        return {driver, rpcClient, bidiEvents};
      }

      const consoleEntry = {
        source: 'console-api',
        level: 'log',
        text: 'hello',
        type: 'log',
        line: 1,
        column: 1,
        repeatCount: 1,
      };
      const networkEntry = {requestId: 'request-1', timestamp: 42};
      const timelineEntry = {record: {type: 'EventDispatch'}};

      it('registers exactly one console and network listener on the remote debugger', async function () {
        const {driver, rpcClient} = buildDriver();

        await driver.setContext('WEBVIEW_5191.1');
        await driver.setContext('NATIVE_APP');
        await driver.setContext('WEBVIEW_5191.2');

        assert.strictEqual(rpcClient.listenerCount('Console.messageAdded'), 1);
        assert.strictEqual(rpcClient.listenerCount('Console.messageRepeatCountUpdated'), 1);
        assert.strictEqual(rpcClient.listenerCount('NetworkEvent'), 1);
      });

      it('stops the previous performance log before starting a new one', async function () {
        const {driver} = buildDriver();

        await driver.setContext('WEBVIEW_5191.1');
        const firstPerformanceLog = driver.logs.performance as IOSPerformanceLog;
        assert.strictEqual(firstPerformanceLog.isCapturing, true);

        await driver.setContext('WEBVIEW_5191.2');
        assert.notStrictEqual(driver.logs.performance, firstPerformanceLog);
        assert.strictEqual(firstPerformanceLog.isCapturing, false);
        assert.strictEqual(firstPerformanceLog.listenerCount('output'), 0);
      });

      it('records each remote debugger event once after switching webviews', async function () {
        const {driver, rpcClient, bidiEvents} = buildDriver();

        await driver.setContext('WEBVIEW_5191.1');
        await driver.setContext('NATIVE_APP');
        await driver.setContext('WEBVIEW_5191.2');

        rpcClient.emit('Console.messageAdded', undefined, consoleEntry);
        rpcClient.emit('NetworkEvent', undefined, networkEntry, 'Network.requestWillBeSent');
        rpcClient.emit('Timeline.eventRecorded', timelineEntry);

        const consoleLogs = await driver.extractLogs('safariConsole', driver.logs);
        const networkLogs = await driver.extractLogs('safariNetwork', driver.logs);
        const performanceLogs = await driver.extractLogs('performance', driver.logs);
        assert.strictEqual(consoleLogs.length, 1, 'safariConsole entries');
        assert.strictEqual(networkLogs.length, 1, 'safariNetwork entries');
        assert.strictEqual(performanceLogs.length, 1, 'performance entries');

        const byType = (type: string) => bidiEvents.filter(({params}) => params.type === type);
        assert.strictEqual(byType('safariConsole').length, 1, 'safariConsole BiDi events');
        assert.strictEqual(byType('safariNetwork').length, 1, 'safariNetwork BiDi events');
        assert.strictEqual(byType('performance').length, 1, 'performance BiDi events');
        assert.deepStrictEqual(
          byType('performance').map(({params}) => params.source.context),
          ['5191.2'],
        );
      });
    });
  });

  describe('onPageChange', function () {
    const pageChangeNotification = {
      appIdKey: '5191',
      pageArray: [
        {
          id: 1,
          title: 'Appium/welcome',
          url: 'http://127.0.0.1:4443/welcome',
          isKey: true,
        },
        {
          id: 3,
          title: 'Bing!',
          url: 'https://www.bing.com/',
          isKey: false,
        },
        {
          id: 4,
          title: 'Google',
          url: 'https://www.google.com/?client=safari&channel=iphone_bm',
          isKey: true,
        },
        {
          id: 5,
          title: '',
          url: 'about:blank',
          isKey: false,
        },
      ],
    };
    it('should call select page if a new page is introduced and that page is not blacklisted', async function () {
      const driver = new XCUITestDriver({} as any);
      driver.curContext = '5191.5';
      driver.contexts = ['5191.5', '5191.3', '5191.4'];
      let selectPageArgs: (string | number)[] | undefined;
      const remoteMock = {
        isConnected: true,
        selectPage: (...args: any[]) => {
          selectPageArgs = args;
          return {catch: () => {}};
        },
      } as any;
      driver._remote = remoteMock;
      driver.opts.safariIgnoreWebHostnames = 'www.google.com, www.bing.com,yahoo.com, about:blank, ';
      await driver.onPageChange(pageChangeNotification);
      assert.deepStrictEqual(selectPageArgs, ['5191', 1]);
    });
    it('should not call selectPage if a new page is introduced and that page is blacklisted', async function () {
      const driver = new XCUITestDriver({} as any);
      driver.curContext = '5191.1';
      const testContexts = [
        ['5191.1', '5191.3', '5191.4'],
        ['5191.1', '5191.3', '5191.5'],
      ];

      for (const testContext of testContexts) {
        driver.contexts = testContext;
        let selectPageArgs: (string | number)[] | null = null;
        const remoteMock = {
          isConnected: true,
          selectPage: (...args: any[]) => {
            selectPageArgs = args;
            return {catch: () => {}};
          },
        } as any;
        driver._remote = remoteMock;
        driver.opts.safariIgnoreWebHostnames = 'www.google.com, www.bing.com,www.yahoo.com, about:blank, ';
        await driver.onPageChange(pageChangeNotification);
        assert.strictEqual(selectPageArgs, null);
      }
    });
  });
});
