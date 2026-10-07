import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {createSandbox, type SinonSandbox, type SinonStub} from 'sinon';

import {ScreenRecorder} from '../../../lib/commands/recordscreen.js';
import {XCUITestDriver} from '../../../lib/driver.js';

describe('startRecordingScreen with forceRestart', function () {
  let sandbox: SinonSandbox;
  let driver: XCUITestDriver;
  let previous: ScreenRecorder;
  let interruptStub: SinonStub;
  let cleanupStub: SinonStub;

  beforeEach(function () {
    sandbox = createSandbox();
    driver = new XCUITestDriver({} as any);
    driver._device = {udid: '00008120-0000000000000000'} as any;
    sandbox.stub(driver, 'proxyCommand').resolves({});
    sandbox.stub(ScreenRecorder.prototype, 'start').resolves();
    previous = new ScreenRecorder('00008120-0000000000000000', driver.log, '/tmp/appium_prev.mp4', {
      remotePort: 9100,
      remoteUrl: 'http://127.0.0.1:8100',
    });
    interruptStub = sandbox.stub(previous, 'interrupt').resolves(true);
    cleanupStub = sandbox.stub(previous, 'cleanup').resolves();
    driver._recentScreenRecorder = previous;
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('should terminate the running recording before deleting its file', async function () {
    await driver.startRecordingScreen({forceRestart: true});
    assert.strictEqual(interruptStub.calledOnceWithExactly(true), true);
    assert.strictEqual(cleanupStub.calledOnce, true);
    assert.strictEqual(interruptStub.calledBefore(cleanupStub), true);
    assert.notStrictEqual(driver._recentScreenRecorder, previous);
  });

  it('should not start a new recording if the running one cannot be stopped', async function () {
    interruptStub.resolves(false);
    await assert.rejects(driver.startRecordingScreen({forceRestart: true}), /Unable to stop screen recording process/);
    assert.strictEqual(cleanupStub.called, false);
    assert.strictEqual((ScreenRecorder.prototype.start as SinonStub).called, false);
    assert.strictEqual(driver._recentScreenRecorder, previous);
  });
});
