import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {runInNewContext} from 'node:vm';

import {errors} from 'appium/driver.js';
import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('web calibration native geometry', () => {
  for (const change of ['position', 'size', 'display', 'reset', 'unchanged', 'null timeout']) {
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
        const implicitWaitMs = change === 'null timeout' ? null : 1234;
        driver.implicitWaitMs = implicitWaitMs;
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
        assert.equal(tap.callCount, ['unchanged', 'null timeout'].includes(change) ? 2 : 4);
        assert.equal(driver.implicitWaitMs, implicitWaitMs);
      } finally {
        sandbox.restore();
      }
    });
  }
});

describe('web calibration iframe selection', () => {
  for (const outcome of ['attached', 'detached', 'different page', 'different frame']) {
    it(`should preserve only a still-attached frame on the same page (${outcome})`, async () => {
      const driver = new XCUITestDriver({} as any);
      driver.curContext = '123.1';
      driver.curWebFrames = ['app-frame', 'nested-frame'];
      const frames = [...driver.curWebFrames];
      const sandbox = sinon.createSandbox();
      let taps: {x: number; y: number}[] = [];
      const resolveFrame = sinon.stub().callsFake(async (_atom, _args, selectedFrames) => {
        assert.deepEqual(selectedFrames, frames);
        if (outcome === 'detached') {
          throw new Error('Frame no longer exists');
        }
        return true;
      });
      try {
        sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
        sandbox
          .stub(driver, 'findNativeElementOrElements')
          .resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
        sandbox.stub(driver, 'proxyCommand').resolves({x: 0, y: 0, width: 400, height: 600});
        sandbox.stub(driver, 'mobileTap').callsFake(async (x: number, y: number) => {
          taps.push({x, y});
        });
        driver._remote = {
          executeAtom: resolveFrame,
          execute: async (script: string) => {
            if (script.includes('createElement')) {
              taps = [];
            } else if (script.includes('return window.__appiumCalibrationTaps')) {
              return taps;
            } else if (script.includes('delete window.__appiumCalibrationOverlay')) {
              // WebKit reports the removal of the calibration iframe. The
              // existing context listener clears all selected frames.
              driver.curWebFrames = outcome === 'different frame' ? ['other-frame'] : [];
              if (outcome === 'different page') {
                driver.curContext = '123.2';
              }
            }
            return {innerWidth: 400, innerHeight: 600};
          },
        } as any;
        await driver.mobileCalibrateWebToRealCoordinatesTranslation();
        assert.deepEqual(
          driver.curWebFrames,
          outcome === 'attached' ? frames : outcome === 'different frame' ? ['other-frame'] : [],
        );
        assert.equal(resolveFrame.callCount, ['attached', 'detached'].includes(outcome) ? 1 : 0);
      } finally {
        sandbox.restore();
      }
    });
  }
});

describe('native web tap atom requests', () => {
  it('waits for the size response before requesting coordinates', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    const sandbox = sinon.createSandbox();
    let resolveSize!: (value: {width: number; height: number}) => void;
    const size = new Promise<{width: number; height: number}>((resolve) => {
      resolveSize = resolve;
    });
    try {
      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      const execute = sandbox.stub(driver, 'executeAtom');
      execute.withArgs('get_size').returns(size);
      execute.withArgs('get_top_left_coordinates').resolves({x: 20, y: 30});
      sandbox.stub(driver, 'measureAndTranslateWebCoords').callsFake(async (fn) => await fn());
      const tap = sandbox.stub(driver, 'mobileTap').resolves();
      const result = driver.nativeWebTap('target');
      try {
        assert.equal(execute.callCount, 1, 'the transport must not receive overlapping atom requests');
        assert.equal(tap.callCount, 0);
      } finally {
        resolveSize({width: 100, height: 80});
        await result;
      }
      assert.equal(execute.callCount, 2);
      assert.ok(tap.calledOnceWithExactly(70, 70));
    } finally {
      sandbox.restore();
    }
  });

  it('does not request coordinates or tap after a size request fails', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      const execute = sandbox.stub(driver, 'executeAtom').rejects(new Error('transport failed'));
      sandbox.stub(driver, 'measureAndTranslateWebCoords').callsFake(async (fn) => await fn());
      const tap = sandbox.stub(driver, 'mobileTap').resolves();
      await assert.rejects(driver.nativeWebTap('target'), /transport failed/);
      assert.equal(execute.callCount, 1);
      assert.equal(tap.callCount, 0);
    } finally {
      sandbox.restore();
    }
  });

  it('falls back to coordinates without waiting for the implicit timeout when the marked element is not exposed natively', async () => {
    const driver = new XCUITestDriver({} as any);
    driver.sessionId = 'session-id';
    driver.implicitWaitMs = 700;
    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      const execute = sandbox.stub(driver, 'executeAtom');
      execute.withArgs('execute_script').resolves({hadAttribute: false, original: null});
      execute.withArgs('get_size').resolves({width: 100, height: 80});
      execute.withArgs('get_top_left_coordinates').resolves({x: 20, y: 30});
      const proxy = sandbox.stub(driver, 'proxyCommand').resolves([]);
      sandbox.stub(driver, 'measureAndTranslateWebCoords').callsFake(async (fn) => await fn());
      const tap = sandbox.stub(driver, 'mobileTap').resolves();

      await driver.nativeWebTap('target');

      assert.equal(proxy.callCount, 1, `expected a single native lookup, got ${proxy.callCount}`);
      assert.ok(tap.calledOnceWithExactly(70, 70));
      assert.equal(driver.implicitWaitMs, 700);
    } finally {
      sandbox.restore();
    }
  });

  it('re-measures element coordinates and dispatches tap to settled native coordinates when keyboard dismisses during calibration', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    driver.curContext = 'WEBVIEW_test';
    const rect = {x: 20, y: 50, width: 400, height: 600};
    let keyboardOpen = true;
    let taps: {x: number; y: number}[] = [];
    const nativeTaps: {x: number; y: number}[] = [];

    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
      sandbox.stub(driver, 'findNativeElementOrElements').resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
      sandbox.stub(driver, 'proxyCommand').callsFake(async (path: string) => (path.endsWith('/rect') ? rect : {}));
      sandbox.stub(driver, 'mobileTap').callsFake(async (x: number, y: number) => {
        nativeTaps.push({x, y});
        // First calibration tap dismisses the keyboard
        if (taps.length === 0) {
          keyboardOpen = false;
        }
        // Calibration taps record web coordinates relative to webview (offset 20, 50)
        taps.push({x: x - rect.x, y: y - rect.y});
      });
      driver._remote = {
        executeAtom: async () => true,
        execute: async (script: string) => {
          if (script.includes('createElement')) {
            taps = [];
            return;
          }
          if (script.includes('return window.__appiumCalibrationTaps')) {
            return taps;
          }
          if (script.includes('delete window.__appiumCalibrationOverlay')) {
            return;
          }
          return {
            innerWidth: 400,
            innerHeight: keyboardOpen ? 300 : 600,
            isScrolledToTop: true,
            visualViewportWidth: 400,
            visualViewportHeight: keyboardOpen ? 300 : 600,
            visualViewportOffsetLeft: 0,
            visualViewportOffsetTop: 0,
            visualViewportScale: 1,
          };
        },
      } as any;

      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      const execute = sandbox.stub(driver, 'executeAtom');
      execute.withArgs('get_size').callsFake(async () => ({width: 100, height: 50}));
      execute.withArgs('get_top_left_coordinates').callsFake(async () => ({
        // While keyboard is open, element is at y=150; after keyboard closes, element settles at y=350
        x: 100,
        y: keyboardOpen ? 150 : 350,
      }));

      // Does not stub clickWebCoords - exercises the full real translateWebCoords path
      await driver.nativeWebTap('target');

      // Calibration taps occurred (2 taps), then final tap on target element (1 tap) = 3 total taps
      assert.equal(nativeTaps.length, 3);
      // Final tap lands on the settled coordinates:
      // Center of element: x = 100 + 50 = 150, y = 350 + 25 = 375
      // With rect offset (20, 50): nativeX = 170, nativeY = 425
      const finalTap = nativeTaps[2];
      assert.deepEqual(finalTap, {x: 170, y: 425});
    } finally {
      sandbox.restore();
    }
  });

  it('re-measures element coordinates if viewport changes while measuring (e.g. keyboard animation settling)', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    driver.curContext = 'WEBVIEW_test';
    const rect = {x: 0, y: 0, width: 400, height: 600};
    let viewportHeight = 400;
    const nativeTaps: {x: number; y: number}[] = [];
    let measurements = 0;

    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
      sandbox.stub(driver, 'findNativeElementOrElements').resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
      sandbox.stub(driver, 'proxyCommand').callsFake(async (path: string) => (path.endsWith('/rect') ? rect : {}));
      sandbox.stub(driver, 'mobileTap').callsFake(async (x: number, y: number) => {
        nativeTaps.push({x, y});
      });
      driver._remote = {
        executeAtom: async () => true,
        execute: async (script: string) => {
          if (script.includes('createElement')) {
            return;
          }
          if (script.includes('return window.__appiumCalibrationTaps')) {
            return [
              {x: 193, y: 293},
              {x: 207, y: 307},
            ];
          }
          if (script.includes('delete window.__appiumCalibrationOverlay')) {
            return;
          }
          return {
            innerWidth: 400,
            innerHeight: viewportHeight,
            isScrolledToTop: true,
            visualViewportWidth: 400,
            visualViewportHeight: viewportHeight,
            visualViewportOffsetLeft: 0,
            visualViewportOffsetTop: 0,
            visualViewportScale: 1,
          };
        },
      } as any;

      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      const execute = sandbox.stub(driver, 'executeAtom');
      execute.withArgs('get_size').callsFake(async () => ({width: 100, height: 50}));
      execute.withArgs('get_top_left_coordinates').callsFake(async () => {
        measurements++;
        if (measurements === 1) {
          // Animation finishes and viewport settles to 600 right after first measurement
          viewportHeight = 600;
          return {x: 50, y: 200};
        }
        return {x: 50, y: 400};
      });

      await driver.nativeWebTap('target');

      // Verified that it re-measured when signature shifted
      assert.ok(measurements >= 2);
      // Final tap used the settled measurement y=400 (+25 = 425)
      const finalTap = nativeTaps[nativeTaps.length - 1];
      assert.equal(finalTap.y, 425);
    } finally {
      sandbox.restore();
    }
  });

  it('re-throws errors during calibration without swallowing or retrying twice', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    driver.curContext = 'WEBVIEW_test';

    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
      sandbox.stub(driver, 'findNativeElementOrElements').rejects(new Error('No WebView found'));
      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      const execute = sandbox.stub(driver, 'executeAtom');
      driver._remote = {
        execute: async () => ({innerWidth: 400, innerHeight: 600}),
      } as any;

      await assert.rejects(driver.nativeWebTap('target'), /No WebView found/);
      // executeAtom was never called because calibration threw
      assert.equal(execute.callCount, 0);
    } finally {
      sandbox.restore();
    }
  });

  it('throws NoSuchFrameError if iframe frame chain could not be restored after calibration', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    driver.curContext = 'WEBVIEW_test';
    driver.curWebFrames = ['nested-frame'];
    const rect = {x: 0, y: 0, width: 400, height: 600};

    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
      sandbox.stub(driver, 'findNativeElementOrElements').resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
      sandbox.stub(driver, 'proxyCommand').callsFake(async (path: string) => (path.endsWith('/rect') ? rect : {}));
      sandbox.stub(driver, 'mobileTap').resolves();
      driver._remote = {
        executeAtom: async () => {
          // Frame restore fails
          throw new Error('Frame detached');
        },
        execute: async (script: string) => {
          if (script.includes('delete window.__appiumCalibrationOverlay')) {
            // Context listener wiped frames on overlay detachment
            driver.curWebFrames = [];
          }
          if (script.includes('return window.__appiumCalibrationTaps')) {
            return [
              {x: 193, y: 293},
              {x: 207, y: 307},
            ];
          }
          return {innerWidth: 400, innerHeight: 600};
        },
      } as any;

      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});

      await assert.rejects(driver.nativeWebTap('target'), errors.NoSuchFrameError);
    } finally {
      sandbox.restore();
    }
  });

  it('warns and proceeds with latest measured coordinates if viewport geometry fails to settle after maximum attempts', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    driver.curContext = 'WEBVIEW_test';
    const rect = {x: 0, y: 0, width: 400, height: 600};
    let viewportHeight = 400;
    const nativeTaps: {x: number; y: number}[] = [];

    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
      sandbox.stub(driver, 'findNativeElementOrElements').resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
      sandbox.stub(driver, 'proxyCommand').callsFake(async (path: string) => (path.endsWith('/rect') ? rect : {}));
      sandbox.stub(driver, 'mobileTap').callsFake(async (x: number, y: number) => {
        nativeTaps.push({x, y});
      });
      const warnSpy = sandbox.spy(driver.log, 'warn');
      driver._remote = {
        executeAtom: async () => true,
        execute: async (script: string) => {
          if (script.includes('return window.__appiumCalibrationTaps')) {
            return [
              {x: 193, y: 293},
              {x: 207, y: 307},
            ];
          }
          if (script.includes('createElement') || script.includes('delete window.__appiumCalibrationOverlay')) {
            return;
          }
          return {
            innerWidth: 400,
            innerHeight: viewportHeight,
            isScrolledToTop: true,
            visualViewportWidth: 400,
            visualViewportHeight: viewportHeight,
            visualViewportOffsetLeft: 0,
            visualViewportOffsetTop: 0,
            visualViewportScale: 1,
          };
        },
      } as any;

      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      let measurementCount = 0;
      const execute = sandbox.stub(driver, 'executeAtom');
      execute.withArgs('get_size').callsFake(async () => ({width: 100, height: 50}));
      execute.withArgs('get_top_left_coordinates').callsFake(async () => {
        measurementCount++;
        viewportHeight += 10;
        return {x: 50, y: 200 + measurementCount * 10};
      });

      await driver.nativeWebTap('target');

      assert.ok(warnSpy.calledWithMatch(/Viewport geometry did not settle after 3 attempts/));
      // Tapped using the latest measured coordinates (measurement 3: y = 230 + 25 = 255)
      const finalTap = nativeTaps[nativeTaps.length - 1];
      assert.equal(finalTap.y, 255);
    } finally {
      sandbox.restore();
    }
  });

  it('refreshes calibration on the final attempt when viewport does not settle, using the latest transform for the fallback tap', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    driver.curContext = 'WEBVIEW_test';
    const rect = {x: 0, y: 50, width: 400, height: 600};
    const nativeTaps: {x: number; y: number}[] = [];
    let viewportHeight = 400;

    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
      sandbox.stub(driver, 'findNativeElementOrElements').resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
      sandbox.stub(driver, 'proxyCommand').callsFake(async (path: string) => (path.endsWith('/rect') ? rect : {}));
      sandbox.stub(driver, 'mobileTap').callsFake(async (x: number, y: number) => {
        nativeTaps.push({x, y});
      });
      const warnSpy = sandbox.spy(driver.log, 'warn');
      driver._remote = {
        executeAtom: async () => true,
        execute: async (script: string) => {
          if (script.includes('return window.__appiumCalibrationTaps')) {
            return [
              {x: 193, y: 293},
              {x: 207, y: 307},
            ];
          }
          if (script.includes('createElement') || script.includes('delete window.__appiumCalibrationOverlay')) {
            return;
          }
          return {
            innerWidth: 400,
            innerHeight: viewportHeight,
            isScrolledToTop: true,
            visualViewportWidth: 400,
            visualViewportHeight: viewportHeight,
            visualViewportOffsetLeft: 0,
            visualViewportOffsetTop: 0,
            visualViewportScale: 1,
          };
        },
      } as any;

      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      let measurementCount = 0;
      const execute = sandbox.stub(driver, 'executeAtom');
      execute.withArgs('get_size').callsFake(async () => ({width: 100, height: 50}));
      execute.withArgs('get_top_left_coordinates').callsFake(async () => {
        measurementCount++;
        viewportHeight += 10;
        if (measurementCount === 3) {
          // Viewport moves native offset to Y=150 on the 3rd (final) measurement
          rect.y = 150;
        }
        return {x: 50, y: 200};
      });

      await driver.nativeWebTap('target');

      assert.equal(measurementCount, 3);
      assert.ok(warnSpy.calledWithMatch(/Viewport geometry did not settle after 3 attempts/));
      // Fallback tap uses refreshed calibration for attempt 3 (rect.y = 150) + web center (200 + 25 = 225) = 375
      const finalTap = nativeTaps[nativeTaps.length - 1];
      assert.equal(finalTap.y, 375);
    } finally {
      sandbox.restore();
    }
  });

  it('throws NoSuchFrameError if in-loop recalibration fails to restore iframe selection', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    driver.curContext = 'WEBVIEW_test';
    driver.curWebFrames = ['frame-1'];
    const rect = {x: 0, y: 50, width: 400, height: 600};
    let viewportHeight = 400;

    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
      sandbox.stub(driver, 'findNativeElementOrElements').resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
      sandbox.stub(driver, 'proxyCommand').callsFake(async (path: string) => (path.endsWith('/rect') ? rect : {}));
      sandbox.stub(driver, 'mobileTap').resolves();

      let calibrationCalls = 0;
      driver._remote = {
        executeAtom: async () => {
          if (calibrationCalls > 1) {
            // Frame restoration throws on subsequent in-loop recalibration
            throw new Error('Frame detached');
          }
          return true;
        },
        execute: async (script: string) => {
          if (script.includes('createElement')) {
            calibrationCalls++;
            return;
          }
          if (script.includes('return window.__appiumCalibrationTaps')) {
            return [
              {x: 193, y: 293},
              {x: 207, y: 307},
            ];
          }
          if (script.includes('delete window.__appiumCalibrationOverlay')) {
            if (calibrationCalls > 1) {
              // Context listener cleared frame chain and restore failed
              driver.curWebFrames = [];
            }
            return;
          }
          return {
            innerWidth: 400,
            innerHeight: viewportHeight,
            isScrolledToTop: true,
            visualViewportWidth: 400,
            visualViewportHeight: viewportHeight,
            visualViewportOffsetLeft: 0,
            visualViewportOffsetTop: 0,
            visualViewportScale: 1,
          };
        },
      } as any;

      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      const execute = sandbox.stub(driver, 'executeAtom');
      execute.withArgs('get_size').callsFake(async () => ({width: 100, height: 50}));
      execute.withArgs('get_top_left_coordinates').callsFake(async () => {
        viewportHeight += 10;
        return {x: 50, y: 200};
      });

      await assert.rejects(
        async () => await driver.nativeWebTap('target'),
        /The frame chain 'frame-1' could not be restored after web coordinate calibration/,
      );
    } finally {
      sandbox.restore();
    }
  });

  it('refreshes calibration and comparison signature when viewport shifts and then stabilizes', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    driver.curContext = 'WEBVIEW_test';
    const rect = {x: 0, y: 50, width: 400, height: 600};
    const nativeTaps: {x: number; y: number}[] = [];
    let measurements = 0;

    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
      sandbox.stub(driver, 'findNativeElementOrElements').resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
      sandbox.stub(driver, 'proxyCommand').callsFake(async (path: string) => (path.endsWith('/rect') ? rect : {}));
      sandbox.stub(driver, 'mobileTap').callsFake(async (x: number, y: number) => {
        nativeTaps.push({x, y});
      });
      const warnSpy = sandbox.spy(driver.log, 'warn');
      driver._remote = {
        executeAtom: async () => true,
        execute: async (script: string) => {
          if (script.includes('createElement') || script.includes('delete window.__appiumCalibrationOverlay')) {
            return;
          }
          if (script.includes('return window.__appiumCalibrationTaps')) {
            return [
              {x: 193, y: 293},
              {x: 207, y: 307},
            ];
          }
          return {
            innerWidth: 400,
            innerHeight: 600,
            isScrolledToTop: true,
            visualViewportWidth: 400,
            visualViewportHeight: 600,
            visualViewportOffsetLeft: 0,
            visualViewportOffsetTop: 0,
            visualViewportScale: 1,
          };
        },
      } as any;

      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      const execute = sandbox.stub(driver, 'executeAtom');
      execute.withArgs('get_size').callsFake(async () => ({width: 100, height: 50}));
      execute.withArgs('get_top_left_coordinates').callsFake(async () => {
        measurements++;
        if (measurements === 1) {
          // Native webview shifts from Y=50 to Y=100 during first measurement and stays at 100
          rect.y = 100;
        }
        return {x: 50, y: 175};
      });

      await driver.nativeWebTap('target');

      // Verified it re-measured and recalibrated
      assert.equal(measurements, 2);
      // No false settling warning because viewport stabilized at Y=100
      assert.ok(warnSpy.neverCalledWithMatch(/Viewport geometry did not settle/));
      // Final tap uses refreshed calibration (offset Y=100) + web coords (175 + 25 = 200) = 300
      const finalTap = nativeTaps[nativeTaps.length - 1];
      assert.equal(finalTap.y, 300);
    } finally {
      sandbox.restore();
    }
  });

  it('routes clickWebCoords with static numbers through measureAndTranslateWebCoords', async () => {
    const driver = new XCUITestDriver({} as any);
    driver.curContext = 'WEBVIEW_test';
    const sandbox = sinon.createSandbox();
    try {
      const measureStub = sandbox.stub(driver, 'measureAndTranslateWebCoords').callsFake(async (fn: any) => {
        const coords = await fn();
        assert.deepEqual(coords, {x: 50, y: 75});
        return {x: 123, y: 456};
      });
      const mobileTapStub = sandbox.stub(driver, 'mobileTap').resolves();

      await driver.clickWebCoords(50, 75);

      assert.equal(measureStub.callCount, 1);
      assert.ok(mobileTapStub.calledOnceWithExactly(123, 456));
    } finally {
      sandbox.restore();
    }
  });

  it('nativeWebTap routes through clickWebCoords so overriding or stubbing it intercepts taps', async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({nativeWebTapStrict: true});
    driver.curContext = 'WEBVIEW_test';
    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'getAtomsElement').returns({ELEMENT: 'target'});
      const clickWebCoordsStub = sandbox.stub(driver, 'clickWebCoords').resolves();

      await driver.nativeWebTap('target');

      assert.equal(clickWebCoordsStub.callCount, 1);
      assert.equal(typeof clickWebCoordsStub.firstCall.args[0], 'function');
    } finally {
      sandbox.restore();
    }
  });

  it('reuses validated calibration during translation without secondary recalibration', async () => {
    const driver = new XCUITestDriver({} as any);
    driver.curContext = 'WEBVIEW_test';
    const calibration = {
      offsetX: 10,
      offsetY: 20,
      pixelRatioX: 2,
      pixelRatioY: 2,
    };

    const sandbox = sinon.createSandbox();
    try {
      driver._remote = {
        execute: async () => {
          throw new Error('remote.execute should not be called when calibration is provided');
        },
      } as any;

      const result = await driver.translateWebCoords(15, 25, calibration);
      assert.deepEqual(result, {
        x: 10 + 15 * 2, // 40
        y: 20 + 25 * 2, // 70
      });
    } finally {
      sandbox.restore();
    }
  });
});

describe('web calibration zoom', () => {
  for (const zoom of [0.8, 1, 1.25, 2]) {
    for (const inFrame of [false, true]) {
      it(`applies the fitted ${zoom}x transform with iframe=${inFrame}`, async () => {
        const driver = new XCUITestDriver({} as any);
        driver.curContext = 'WEBVIEW_zoom';
        driver.curWebFrames = inFrame ? ['frame'] : [];
        const rect = {x: 20, y: 50, width: 400, height: 600};
        const frame = {crossOrigin: false, offsetX: 30, offsetY: 40};
        const state = {
          innerWidth: 400 / zoom,
          innerHeight: 600 / zoom,
          outerWidth: 400,
          outerHeight: 600,
          visualViewportWidth: 400 / zoom,
          visualViewportHeight: 600 / zoom,
          visualViewportOffsetLeft: 0,
          visualViewportOffsetTop: 0,
          visualViewportScale: zoom,
        };
        // A fixed overlay may have a nonzero client rect after visual-viewport panning.
        const overlayRect = {left: -15, top: -80};
        const page: any = {};
        let onClick!: (event: {clientX: number; clientY: number}) => void;
        const overlay = {
          style: {},
          setAttribute() {},
          remove() {},
          getBoundingClientRect: () => overlayRect,
          contentDocument: {
            addEventListener: (_name: string, listener: typeof onClick) => {
              onClick = listener;
            },
          },
        };
        const document = {createElement: () => overlay, documentElement: {appendChild() {}}};
        const sandbox = sinon.createSandbox();
        try {
          sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
          sandbox
            .stub(driver, 'findNativeElementOrElements')
            .resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
          sandbox.stub(driver, 'proxyCommand').callsFake(async (path: string) => (path.endsWith('/rect') ? rect : {}));
          sandbox.stub(driver, 'execute').resolves(frame);
          sandbox.stub(driver, 'mobileTap').callsFake(async (x: number, y: number) => {
            onClick({clientX: (x - rect.x) / zoom - overlayRect.left, clientY: (y - rect.y) / zoom - overlayRect.top});
          });
          driver._remote = {
            executeAtom: async () => true,
            execute: async (script: string) => {
              if (script.includes('createElement')) {
                runInNewContext(script, {window: page, document});
                return;
              }
              if (script.includes('return window.__appiumCalibrationTaps')) {
                return page.__appiumCalibrationTaps;
              }
              return state;
            },
          } as any;
          // Exercise real calibration and its cached transform, with nonzero offsets.
          for (const point of [
            {x: 100, y: 100},
            {x: 140, y: 180},
          ]) {
            const actual = await driver.translateWebCoords(point.x, point.y);
            const expected = {
              x: rect.x + (point.x + (inFrame ? frame.offsetX : 0)) * zoom,
              y: rect.y + (point.y + (inFrame ? frame.offsetY : 0)) * zoom,
            };
            assert.ok(Math.abs(actual.x - expected.x) < 1e-8, JSON.stringify({actual, expected}));
            assert.ok(Math.abs(actual.y - expected.y) < 1e-8, JSON.stringify({actual, expected}));
          }
        } finally {
          sandbox.restore();
        }
      });
    }
  }
});

describe('web calibration overlay', () => {
  it('attaches to the root element so a shadow root on body cannot hide it', async () => {
    const driver = new XCUITestDriver({} as any);
    driver.curContext = 'WEBVIEW_shadow';
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
    const page: any = {};
    let onClick!: (event: {clientX: number; clientY: number}) => void;
    let parent: unknown;
    const overlay = {
      style: {},
      setAttribute() {},
      remove() {},
      getBoundingClientRect: () => ({left: 0, top: 0}),
      contentDocument: {
        addEventListener: (_name: string, listener: typeof onClick) => {
          onClick = listener;
        },
      },
    };
    // Body has an open shadow root, so its light DOM children are not rendered.
    const body = {shadowRoot: {}, appendChild: () => (parent = body)};
    const documentElement = {appendChild: () => (parent = documentElement)};
    const document = {createElement: () => overlay, body, documentElement};
    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, 'waitForAtom').callsFake(async (p: any) => await p);
      sandbox.stub(driver, 'findNativeElementOrElements').resolves({'element-6066-11e4-a52e-4f735466cecf': 'webview'});
      sandbox.stub(driver, 'proxyCommand').callsFake(async (path: string) => (path.endsWith('/rect') ? rect : {}));
      sandbox.stub(driver, 'mobileTap').callsFake(async (x: number, y: number) => {
        if (parent === documentElement) {
          onClick({clientX: x - rect.x, clientY: y - rect.y});
        }
      });
      driver._remote = {
        executeAtom: async () => true,
        execute: async (script: string) => {
          if (script.includes('createElement')) {
            runInNewContext(script, {window: page, document});
            return;
          }
          if (script.includes('return window.__appiumCalibrationTaps')) {
            return page.__appiumCalibrationTaps;
          }
          return state;
        },
      } as any;

      assert.deepEqual(await driver.translateWebCoords(100, 100), {x: 120, y: 150});
      assert.equal(parent, documentElement);
    } finally {
      sandbox.restore();
    }
  });
});
