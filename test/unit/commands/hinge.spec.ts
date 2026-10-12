import assert from 'node:assert/strict';
import {describe, it, afterEach} from 'node:test';

import {errors} from '@appium/base-driver';
import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('simulated hinge angle', () => {
  afterEach(() => sinon.restore());

  it('reads current angles through execute on simulators and real devices', async () => {
    const driver = new XCUITestDriver({} as any);
    const realDevice = sinon.stub(driver, 'isRealDevice');
    const proxy = sinon.stub(driver, 'proxyCommand');
    for (const isReal of [false, true]) {
      realDevice.returns(isReal);
      for (const angle of [0, 90.5, 180]) {
        proxy.resolves(angle);
        assert.equal(await driver.execute('mobile: getSimulatedHingeAngle', []), angle);
        assert.deepEqual(proxy.lastCall.args, ['/wda/device/hingeAngle', 'GET']);
      }
    }
  });

  it('delegates platform and device support checks to WDA', async () => {
    const driver = new XCUITestDriver({} as any);
    const realDevice = sinon.stub(driver, 'isRealDevice');
    const wdaError = new Error('Hinge is unavailable on this device');
    const proxy = sinon.stub(driver, 'proxyCommand').rejects(wdaError);
    for (const platformName of ['iOS', 'tvOS', 'watchOS']) {
      driver.opts.platformName = platformName;
      for (const isReal of [false, true]) {
        realDevice.returns(isReal);
        await assert.rejects(driver.execute('mobile: getSimulatedHingeAngle', []), (err) => err === wdaError);
        assert.deepEqual(proxy.lastCall.args, ['/wda/device/hingeAngle', 'GET']);
        await assert.rejects(
          driver.execute('mobile: setSimulatedHingeAngle', [{angle: 90}]),
          (err) => err === wdaError,
        );
        assert.deepEqual(proxy.lastCall.args, ['/wda/device/hingeAngle', 'POST', {angle: 90}]);
      }
    }
    assert.equal(proxy.callCount, 12);
  });

  it('propagates WDA reading errors', async () => {
    const driver = new XCUITestDriver({} as any);
    const proxy = sinon.stub(driver, 'proxyCommand');
    for (const message of ['Hinge angle reading is unavailable', 'Timed out waiting for a valid hinge angle']) {
      proxy.rejects(new Error(message));
      await assert.rejects(driver.execute('mobile: getSimulatedHingeAngle', []), {message});
    }
  });

  it('maps execute arguments and preserves fractional angles on simulators and real devices', async () => {
    const driver = new XCUITestDriver({} as any);
    const realDevice = sinon.stub(driver, 'isRealDevice');
    const proxy = sinon.stub(driver, 'proxyCommand').resolves();
    for (const isReal of [false, true]) {
      realDevice.returns(isReal);
      for (const angle of [0, 90.5, 180]) {
        await driver.execute('mobile: setSimulatedHingeAngle', [{angle}]);
        assert.deepEqual(proxy.lastCall.args, ['/wda/device/hingeAngle', 'POST', {angle}]);
      }
    }
  });

  it('delegates angle validation to WDA and propagates its error unchanged', async () => {
    const driver = new XCUITestDriver({} as any);
    const wdaError = new errors.InvalidArgumentError('angle must be a finite number between 0 and 180 degrees');
    const proxy = sinon.stub(driver, 'proxyCommand').rejects(wdaError);
    for (const angle of [-1, 181, NaN, Infinity, -Infinity, '90', true, null, undefined]) {
      await assert.rejects(driver.mobileSetSimulatedHingeAngle(angle as any), (err) => err === wdaError);
      assert.deepEqual(proxy.lastCall.args, ['/wda/device/hingeAngle', 'POST', {angle}]);
    }
  });

  it('requires the angle through the standard execute-method argument mapping', async () => {
    const driver = new XCUITestDriver({} as any);
    const proxy = sinon.stub(driver, 'proxyCommand');
    await assert.rejects(driver.execute('mobile: setSimulatedHingeAngle', [{}]));
    sinon.assert.notCalled(proxy);
  });

  it('propagates WDA unsupported-model and runtime errors', async () => {
    const driver = new XCUITestDriver({} as any);
    sinon.stub(driver, 'isRealDevice').returns(false);
    sinon.stub(driver, 'proxyCommand').rejects(new Error('unsupported model'));
    await assert.rejects(driver.mobileSetSimulatedHingeAngle(90), /unsupported model/);
  });
});
