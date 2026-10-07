import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('web calibration native geometry', () => {
  for (const change of ['position', 'size', 'display', 'reset', 'unchanged']) {
    it(`should handle ${change} with an unchanged CSS viewport`, async () => {
      const driver = new XCUITestDriver({} as any);
      driver.curContext = 'WEBVIEW_same';
      const rect = {x: 20, y: 50, width: 400, height: 600};
      const state = {
        innerWidth: 400,
        innerHeight: 600,
        outerWidth: 400,
        outerHeight: 600,
        isScrolledToTop: true,
        visualViewportWidth: 400,
        visualViewportHeight: 600,
        visualViewportOffsetLeft: 0,
        visualViewportOffsetTop: 0,
        visualViewportScale: 1,
      };
      let taps: {x: number; y: number}[] = [];
      const sandbox = sinon.createSandbox();
      try {
        sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
        sandbox
          .stub(driver, 'findNativeElementOrElements')
          .resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
        sandbox
          .stub(driver, 'proxyCommand')
          .callsFake(async (path: string) => (path.endsWith('/rect') ? {...rect} : {}));
        const tap = sandbox.stub(driver, 'mobileTap').callsFake(async (x: number, y: number) => {
          taps.push({x: x - rect.x, y: y - rect.y});
        });
        driver._remote = {
          execute: async (script: string) => {
            if (script.includes('createElement')) {
              taps = [];
              return;
            }
            if (script.includes('return window.__appiumCalibrationTaps')) {
              return taps;
            }
            return state;
          },
        } as any;
        if (change === 'reset') {
          await driver.updateSettings({currentDisplayId: 3});
        }
        driver.implicitWaitMs = 1234;
        assert.deepEqual(await driver.translateWebCoords(10, 10), {x: 30, y: 60});
        assert.equal(tap.callCount, 2);
        if (change === 'position') {
          rect.x = 80;
        }
        if (change === 'size') {
          rect.width = 500;
        }
        if (change === 'display') {
          await driver.updateSettings({currentDisplayId: 3});
        }
        if (change === 'reset') {
          await driver.updateSettings({currentDisplayId: null});
        }
        assert.deepEqual(await driver.translateWebCoords(10, 10), {x: rect.x + 10, y: rect.y + 10});
        assert.equal(tap.callCount, change === 'unchanged' ? 2 : 4);
        assert.equal(driver.implicitWaitMs, 1234);
      } finally {
        sandbox.restore();
      }
    });
  }
});
