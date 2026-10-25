import assert from 'node:assert/strict';
import {describe, it, afterEach} from 'node:test';

import {errors} from 'appium/driver.js';
import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('host simulator HID routing', () => {
  afterEach(() => sinon.restore());
  function setup(isSimulator = true) {
    const driver = new XCUITestDriver({} as any);
    sinon.stub(driver, 'isSimulator').returns(isSimulator);
    const device = {
      isDuo: sinon.stub().resolves(true),
      setSimulatedHingeAngle: sinon.stub().resolves(),
      pressHidButton: sinon.stub().resolves(),
    };
    sinon.stub(driver, 'device').get(() => device);
    const proxy = sinon.stub(driver, 'proxyCommand').resolves(90);
    return {driver, device, proxy};
  }
  it('reads angles through WDA on simulators and real devices', async () => {
    for (const simulator of [true, false]) {
      const {driver, proxy} = setup(simulator);
      assert.equal(await driver.execute('mobile: getSimulatedHingeAngle', []), 90);
      sinon.assert.calledWithExactly(proxy, '/wda/device/hingeAngle', 'GET');
    }
  });
  it('checks Duo device type then sends fractional angles to the host', async () => {
    const {driver, device, proxy} = setup();
    for (const angle of [0, 90.5, 180]) {
      await driver.execute('mobile: setSimulatedHingeAngle', [{angle}]);
      sinon.assert.calledWithExactly(device.setSimulatedHingeAngle, angle);
    }
    assert.ok(proxy.args.every((args) => args[1] === 'GET'));
  });
  it('rejects physical-device writes without sending HID or probing WDA', async () => {
    const {driver, device, proxy} = setup(false);
    await assert.rejects(driver.mobileSetSimulatedHingeAngle(90), errors.UnsupportedOperationError);
    sinon.assert.notCalled(proxy);
    sinon.assert.notCalled(device.setSimulatedHingeAngle);
  });
  it('delegates angle validation and translates native TypeErrors', async () => {
    const {driver, device, proxy} = setup();
    const message = 'angle is outside the supported range';
    device.setSimulatedHingeAngle.rejects(new TypeError(message));
    await assert.rejects(driver.mobileSetSimulatedHingeAngle(181), {
      name: 'InvalidArgumentError',
      message,
    });
    sinon.assert.calledWithExactly(device.setSimulatedHingeAngle, 181);
    sinon.assert.notCalled(proxy);
    device.setSimulatedHingeAngle.resetHistory();
    await assert.rejects(driver.execute('mobile: setSimulatedHingeAngle', [{}]));
    sinon.assert.notCalled(device.setSimulatedHingeAngle);
  });
  it('preserves ordinary simulator and physical button routes', async () => {
    for (const simulator of [true, false]) {
      const {driver, proxy, device} = setup(simulator);
      device.isDuo.resolves(false);
      for (const name of ['home', 'volumeUp', 'volumeDown'] as const) {
        await driver.mobilePressButton(name);
        sinon.assert.calledWithExactly(proxy, '/wda/pressButton', 'POST', {name, duration: undefined});
      }
      sinon.assert.notCalled(device.pressHidButton);
    }
  });
  it('does not treat hinge availability as Duo identity or call unavailable controls', async () => {
    const {driver, device, proxy} = setup();
    device.isDuo.resolves(false);
    await driver.mobilePressButton('home');
    sinon.assert.notCalled(device.pressHidButton);
    assert.ok(proxy.args.every(([path]) => path !== '/wda/device/hingeAngle'));
    device.isDuo.resolves(true);
    (device as any).setSimulatedHingeAngle = undefined;
    await driver.mobilePressButton('home');
    sinon.assert.notCalled(device.pressHidButton);
  });
  it('routes Duo Home and volume buttons through the host case-insensitively', async () => {
    const {driver, device, proxy} = setup();
    for (const [name, usage] of [
      ['HOME', 64],
      ['volumeUp', 233],
      ['VOLUMEDOWN', 234],
    ] as const) {
      await driver.mobilePressButton(name, 2);
      sinon.assert.calledWithExactly(device.pressHidButton, 12, usage);
    }
    sinon.assert.notCalled(proxy);
  });
  it('rejects unmapped Duo button names without falling back to WDA', async () => {
    const {driver, device, proxy} = setup();
    for (const name of ['action', 'camera'] as const) {
      await assert.rejects(driver.mobilePressButton(name), errors.UnsupportedOperationError);
    }
    sinon.assert.notCalled(proxy);
    sinon.assert.notCalled(device.pressHidButton);
  });
  it('routes arbitrary Duo IO HID pages and usages through CoreSim', async () => {
    const {driver, device, proxy} = setup();
    for (const [page, usage] of [
      [12, 101],
      [7, 42],
      [0xff61, 0xffff],
    ]) {
      await driver.mobilePerformIoHidEvent(page, usage, '0.1');
      sinon.assert.calledWithExactly(device.pressHidButton, page, usage, 0.1);
    }
    sinon.assert.notCalled(proxy);
    device.pressHidButton.rejects(new TypeError('usage is outside the supported range'));
    await assert.rejects(driver.mobilePerformIoHidEvent(12, 65536, 0.1), errors.InvalidArgumentError);
    const failure = new Error('HID unavailable');
    device.pressHidButton.rejects(failure);
    await assert.rejects(driver.mobilePerformIoHidEvent(12, 64, 0.1), (err) => err === failure);
  });
  it('preserves WDA IO HID routing on other simulators and real devices', async () => {
    for (const isSimulator of [true, false]) {
      const {driver, device, proxy} = setup(isSimulator);
      device.isDuo.resolves(false);
      await driver.mobilePerformIoHidEvent(12, 64, '0.1');
      sinon.assert.calledWithExactly(proxy, '/wda/performIoHidEvent', 'POST', {page: 12, usage: 64, duration: 0.1});
      sinon.assert.notCalled(device.pressHidButton);
    }
  });
  it('does not hide probe or host transport errors', async () => {
    const {driver, device} = setup();
    device.isDuo.rejects(new Error('Device lookup failed'));
    await assert.rejects(driver.mobilePressButton('home'), /Device lookup failed/);
    sinon.assert.notCalled(device.pressHidButton);
    device.isDuo.resolves(true);
    device.setSimulatedHingeAngle.rejects(new Error('HID service missing'));
    await assert.rejects(driver.mobileSetSimulatedHingeAngle(90), /HID service missing/);
  });
  it('keeps rotation routes proxied to WDA for its internal wait logic', () => {
    for (const isSimulator of [true, false]) {
      const {driver} = setup(isSimulator);
      for (const endpoint of ['orientation', 'rotation']) {
        assert.equal(
          driver
            .getProxyAvoidList()
            .some(([method, path]) => method === 'POST' && path.test(`/session/test/${endpoint}`)),
          false,
        );
      }
    }
  });
  it('retries Home once while waiting for unlock', async () => {
    const {driver, device} = setup();
    const locked = sinon.stub(driver, 'isLocked').resolves(true);
    device.pressHidButton.onSecondCall().callsFake(async () => locked.resolves(false));
    await driver.unlock();
    assert.deepEqual(device.pressHidButton.args, [
      [12, 64],
      [12, 64],
    ]);
  });
  it('does not retry Home when reading the unlock state fails', async () => {
    const {driver, device} = setup();
    const failure = new Error('WDA disconnected');
    const locked = sinon.stub(driver, 'isLocked').resolves(true);
    locked.onSecondCall().rejects(failure);
    await assert.rejects(driver.unlock(), (err) => err === failure);
    sinon.assert.calledOnce(device.pressHidButton);
  });
  it('preserves read and transport errors during lock polling', async () => {
    const {driver, device} = setup();
    const failure = new Error('WDA disconnected');
    const locked = sinon.stub(driver, 'isLocked').onFirstCall().resolves(false);
    locked.onSecondCall().rejects(failure);
    await assert.rejects(driver.lock(), (err) => err === failure);
    locked.resolves(false);
    device.pressHidButton.rejects(failure);
    await assert.rejects(driver.lock(), (err) => err === failure);
  });
  it('locks and unlocks only when a state change is required', async () => {
    const {driver, device} = setup();
    const locked = sinon.stub(driver, 'isLocked');
    locked.onCall(0).resolves(false);
    locked.onCall(1).resolves(true);
    locked.onCall(2).resolves(true);
    locked.onCall(3).resolves(true);
    locked.onCall(4).resolves(false);
    await driver.lock();
    await driver.lock();
    await driver.unlock();
    assert.deepEqual(device.pressHidButton.args, [
      [12, 48],
      [12, 64],
    ]);
  });
});
