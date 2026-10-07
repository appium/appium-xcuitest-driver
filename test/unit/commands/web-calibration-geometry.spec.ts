import assert from "node:assert/strict";
import { describe, it } from "node:test";

import sinon from "sinon";

import { XCUITestDriver } from "../../../lib/driver.js";

describe("web calibration native geometry", () => {
  for (const change of ["position", "size", "display", "reset", "unchanged"]) {
    it(`should handle ${change} with an unchanged CSS viewport`, async () => {
      const driver = new XCUITestDriver({} as any);
      driver.curContext = "WEBVIEW_same";
      const rect = { x: 20, y: 50, width: 400, height: 600 };
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
      let taps: { x: number; y: number }[] = [];
      const sandbox = sinon.createSandbox();
      try {
        sandbox.stub(driver, "waitForAtom").callsFake(async (p: any) => await p);
        sandbox
          .stub(driver, "findNativeElementOrElements")
          .resolves({ "element-6066-11e4-a52e-4f735466cecf": "webview" });
        sandbox
          .stub(driver, "proxyCommand")
          .callsFake(async (path: string) => (path.endsWith("/rect") ? { ...rect } : {}));
        const tap = sandbox.stub(driver, "mobileTap").callsFake(async (x: number, y: number) => {
          taps.push({ x: x - rect.x, y: y - rect.y });
        });
        driver._remote = {
          execute: async (script: string) => {
            if (script.includes("createElement")) {
              taps = [];
              return;
            }
            if (script.includes("return window.__appiumCalibrationTaps")) {
              return taps;
            }
            return state;
          },
        } as any;
        if (change === "reset") {
          await driver.updateSettings({ currentDisplayId: 3 });
        }
        driver.implicitWaitMs = 1234;
        assert.deepEqual(await driver.translateWebCoords(10, 10), { x: 30, y: 60 });
        assert.equal(tap.callCount, 2);
        if (change === "position") {
          rect.x = 80;
        }
        if (change === "size") {
          rect.width = 500;
        }
        if (change === "display") {
          await driver.updateSettings({ currentDisplayId: 3 });
        }
        if (change === "reset") {
          await driver.updateSettings({ currentDisplayId: null });
        }
        assert.deepEqual(await driver.translateWebCoords(10, 10), { x: rect.x + 10, y: rect.y + 10 });
        assert.equal(tap.callCount, change === "unchanged" ? 2 : 4);
        assert.equal(driver.implicitWaitMs, 1234);
      } finally {
        sandbox.restore();
      }
    });
  }
});

describe("web calibration iframe selection", () => {
  for (const outcome of ["attached", "detached", "different page", "different frame"]) {
    it(`should preserve only a still-attached frame on the same page (${outcome})`, async () => {
      const driver = new XCUITestDriver({} as any);
      driver.curContext = "123.1";
      driver.curWebFrames = ["app-frame", "nested-frame"];
      const frames = [...driver.curWebFrames];
      const sandbox = sinon.createSandbox();
      let taps: { x: number; y: number }[] = [];
      const resolveFrame = sinon.stub().callsFake(async (_atom, _args, selectedFrames) => {
        assert.deepEqual(selectedFrames, frames);
        if (outcome === "detached") {
          throw new Error("Frame no longer exists");
        }
        return true;
      });
      try {
        sandbox.stub(driver, "waitForAtom").callsFake(async (p: any) => await p);
        sandbox
          .stub(driver, "findNativeElementOrElements")
          .resolves({ "element-6066-11e4-a52e-4f735466cecf": "webview" });
        sandbox.stub(driver, "proxyCommand").resolves({ x: 0, y: 0, width: 400, height: 600 });
        sandbox.stub(driver, "mobileTap").callsFake(async (x: number, y: number) => {
          taps.push({ x, y });
        });
        driver._remote = {
          executeAtom: resolveFrame,
          execute: async (script: string) => {
            if (script.includes("createElement")) {
              taps = [];
            } else if (script.includes("return window.__appiumCalibrationTaps")) {
              return taps;
            } else if (script.includes("delete window.__appiumCalibrationOverlay")) {
              // WebKit reports the removal of the calibration iframe. The
              // existing context listener clears all selected frames.
              driver.curWebFrames = outcome === "different frame" ? ["other-frame"] : [];
              if (outcome === "different page") {
                driver.curContext = "123.2";
              }
            }
            return { innerWidth: 400, innerHeight: 600 };
          },
        } as any;
        await driver.mobileCalibrateWebToRealCoordinatesTranslation();
        assert.deepEqual(
          driver.curWebFrames,
          outcome === "attached" ? frames : outcome === "different frame" ? ["other-frame"] : [],
        );
        assert.equal(resolveFrame.callCount, ["attached", "detached"].includes(outcome) ? 1 : 0);
      } finally {
        sandbox.restore();
      }
    });
  }
});

describe("native web tap atom requests", () => {
  it("waits for the size response before requesting coordinates", async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({ nativeWebTapStrict: true });
    const sandbox = sinon.createSandbox();
    let resolveSize!: (value: { width: number; height: number }) => void;
    const size = new Promise<{ width: number; height: number }>((resolve) => {
      resolveSize = resolve;
    });
    try {
      sandbox.stub(driver, "getAtomsElement").returns({ ELEMENT: "target" });
      const execute = sandbox.stub(driver, "executeAtom");
      execute.withArgs("get_size").returns(size);
      execute.withArgs("get_top_left_coordinates").resolves({ x: 20, y: 30 });
      const tap = sandbox.stub(driver, "clickWebCoords").resolves();
      const result = driver.nativeWebTap("target");
      try {
        assert.equal(execute.callCount, 1, "the transport must not receive overlapping atom requests");
        assert.equal(tap.callCount, 0);
      } finally {
        resolveSize({ width: 100, height: 80 });
        await result;
      }
      assert.equal(execute.callCount, 2);
      assert.ok(tap.calledOnceWithExactly(70, 70));
    } finally {
      sandbox.restore();
    }
  });

  it("does not request coordinates or tap after a size request fails", async () => {
    const driver = new XCUITestDriver({} as any);
    await driver.updateSettings({ nativeWebTapStrict: true });
    const sandbox = sinon.createSandbox();
    try {
      sandbox.stub(driver, "getAtomsElement").returns({ ELEMENT: "target" });
      const execute = sandbox.stub(driver, "executeAtom").rejects(new Error("transport failed"));
      const tap = sandbox.stub(driver, "clickWebCoords").resolves();
      await assert.rejects(driver.nativeWebTap("target"), /transport failed/);
      assert.equal(execute.callCount, 1);
      assert.equal(tap.callCount, 0);
    } finally {
      sandbox.restore();
    }
  });
});
