import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

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

    it('caches the backend instance across repeated accesses while state is unchanged', function () {
      const driver = new XCUITestDriver({} as any);
      driver._remote = null;
      assert.strictEqual(driver._webExecutionBackend, driver._webExecutionBackend);
    });

    it('re-evaluates on every access, resuming the automation-session backend after a native detour', function () {
      const driver = new XCUITestDriver({} as any);
      const fakeSession = {isStarted: true};
      driver._remote = {automationSession: fakeSession} as any;
      const started = driver._webExecutionBackend;
      assert.strictEqual(started instanceof AutomationSessionBackend, true);

      fakeSession.isStarted = false;
      assert.strictEqual(driver._webExecutionBackend instanceof AtomsBackend, true);

      fakeSession.isStarted = true;
      assert.strictEqual(driver._webExecutionBackend, started);
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
