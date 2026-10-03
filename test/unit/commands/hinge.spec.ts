import assert from 'node:assert/strict';
import {describe, it, afterEach} from 'node:test';

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

  it('rejects reading on unsupported platforms without dispatching', async () => {
    const driver = new XCUITestDriver({} as any);
    const proxy = sinon.stub(driver, 'proxyCommand');
    for (const platformName of ['tvOS', 'watchOS']) {
      driver.opts.platformName = platformName;
      await assert.rejects(driver.execute('mobile: getSimulatedHingeAngle', []), /only supported/);
    }
    sinon.assert.notCalled(proxy);
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

  it('rejects invalid and missing angles without dispatching', async () => {
    const driver = new XCUITestDriver({} as any);
    const proxy = sinon.stub(driver, 'proxyCommand');
    for (const angle of [-1, 181, NaN, Infinity, '90', true, null, undefined]) {
      await assert.rejects(driver.mobileSetSimulatedHingeAngle(angle as any), /finite number/);
    }
    await assert.rejects(driver.execute('mobile: setSimulatedHingeAngle', [{}]));
    sinon.assert.notCalled(proxy);
  });

  it('rejects setting on unsupported platforms without dispatching', async () => {
    const driver = new XCUITestDriver({} as any);
    const proxy = sinon.stub(driver, 'proxyCommand');
    for (const platformName of ['tvOS', 'watchOS']) {
      driver.opts.platformName = platformName;
      await assert.rejects(driver.mobileSetSimulatedHingeAngle(90), /only supported/);
    }
    sinon.assert.notCalled(proxy);
  });

  it('propagates WDA unsupported-model and runtime errors', async () => {
    const driver = new XCUITestDriver({} as any);
    sinon.stub(driver, 'isRealDevice').returns(false);
    sinon.stub(driver, 'proxyCommand').rejects(new Error('unsupported model'));
    await assert.rejects(driver.mobileSetSimulatedHingeAngle(90), /unsupported model/);
  });
});
