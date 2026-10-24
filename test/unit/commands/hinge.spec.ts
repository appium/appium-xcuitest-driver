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
      setHidOrientation: sinon.stub().resolves(),
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
  it('validates angles before dispatch', async () => {
    const {driver, device, proxy} = setup();
    for (const angle of [-1, 181, NaN, Infinity, '90', null, undefined]) {
      await assert.rejects(driver.mobileSetSimulatedHingeAngle(angle as any), errors.InvalidArgumentError);
    }
    await assert.rejects(driver.execute('mobile: setSimulatedHingeAngle', [{}]));
    sinon.assert.notCalled(proxy);
    sinon.assert.notCalled(device.setSimulatedHingeAngle);
  });
  it('preserves ordinary simulator and physical Home routes', async () => {
    for (const simulator of [true, false]) {
      const {driver, proxy, device} = setup(simulator);
      device.isDuo.resolves(false);
      await driver.mobilePressButton('home');
      sinon.assert.calledWithExactly(proxy, '/wda/pressButton', 'POST', {name: 'home', duration: undefined});
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
    (device as any).setHidOrientation = undefined;
    await driver.mobilePressButton('home');
    sinon.assert.notCalled(device.pressHidButton);
  });
  it('routes Duo Home through the host while preserving other XCTest buttons', async () => {
    const {driver, device, proxy} = setup();
    await driver.mobilePressButton('home');
    sinon.assert.calledWithExactly(device.pressHidButton, 12, 64);
    await driver.mobilePressButton('volumeUp');
    sinon.assert.calledWithExactly(proxy, '/wda/pressButton', 'POST', {name: 'volumeUp', duration: undefined});
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
  it('uses the selected display metadata for orientation then verifies through WDA', async () => {
    const {driver, device, proxy} = setup();
    sinon.stub(driver, 'mobileListDisplays').resolves([
      {id: 41, isDefault: true},
      {id: 99, isDefault: false},
    ] as any);
    sinon.stub(driver.settings, 'getSettings').returns({currentDisplayId: 99} as any);
    proxy
      .withArgs('/rotation', 'GET')
      .onCall(0)
      .resolves({x: 0, y: 0, z: 0})
      .onCall(1)
      .resolves({x: 0, y: 0, z: 270})
      .onCall(2)
      .resolves({x: 0, y: 0, z: 90});
    await driver.setOrientation('LANDSCAPE');
    sinon.assert.calledWithExactly(device.setHidOrientation, 'landscape-left', false);
    sinon.assert.calledWithExactly(proxy, '/rotation', 'GET');
    assert.ok(device.setHidOrientation.firstCall.calledBefore(proxy.lastCall));
    await driver.setRotation(0, 0, 90);
    sinon.assert.calledWithExactly(device.setHidOrientation, 'landscape-right', false);
    assert.ok(proxy.args.every(([, method]) => method === 'GET'));
    assert.ok(proxy.args.every(([path]) => path !== '/wda/deviceOrientation'));
    assert.deepEqual(
      proxy.args.map(([path]) => path),
      ['/rotation', '/rotation', '/rotation'],
    );
  });
  it('fails if the app does not rotate and propagates read errors', async () => {
    const {driver, proxy} = setup();
    sinon.stub(driver, 'mobileListDisplays').resolves([{id: 1, isDefault: true}] as any);
    proxy.withArgs('/rotation', 'GET').resolves({x: 0, y: 0, z: 90});
    await assert.rejects(driver.setOrientation('PORTRAIT'), /did not rotate/);
    proxy.withArgs('/rotation', 'GET').rejects(new Error('WDA disconnected'));
    await assert.rejects(driver.setOrientation('PORTRAIT'), /WDA disconnected/);
  });
  it('rejects an unavailable display before injecting orientation', async () => {
    const {driver, device} = setup();
    sinon.stub(driver, 'mobileListDisplays').resolves([]);
    await assert.rejects(driver.setOrientation('PORTRAIT'), errors.InvalidArgumentError);
    sinon.assert.notCalled(device.setHidOrientation);
  });
  it('preserves physical-device rotation and propagates verification failure', async () => {
    const {driver, device, proxy} = setup(false);
    proxy.rejects(new Error('orientation did not change'));
    await assert.rejects(driver.setOrientation('LANDSCAPE'), /orientation did not change/);
    sinon.assert.notCalled(device.setHidOrientation);
    sinon.assert.calledOnce(proxy);
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
