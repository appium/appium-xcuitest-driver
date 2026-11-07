import assert from 'node:assert/strict';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {mobileGetDeviceInfo} from '../../../lib/commands/device-info.js';
import {isDuo} from '../../../lib/commands/helpers/duo.js';
import {LockdownClient} from '../../../lib/device/lockdown-client.js';
import type {XCUITestDriver} from '../../../lib/driver.js';

describe('Duo identification from DeviceInfo', () => {
  afterEach(() => sinon.restore());

  function setup(hasHinge: unknown, simulator = true) {
    const getInfo = sinon.stub().resolves({hasHinge});
    const driver = {
      sessionId: 'first-session',
      device: {udid: 'device'},
      isSimulator: sinon.stub().returns(simulator),
      mobileGetDeviceInfo: getInfo,
    } as unknown as XCUITestDriver;
    return {driver, getInfo};
  }

  for (const simulator of [true, false]) {
    it(`uses and caches DeviceInfo on ${simulator ? 'simulators' : 'physical devices'}`, async () => {
      const {driver, getInfo} = setup(true, simulator);
      assert.deepEqual(await Promise.all([isDuo(driver), isDuo(driver)]), [true, true]);
      assert.equal(await isDuo(driver), true);
      sinon.assert.calledOnceWithExactly(getInfo);
      sinon.assert.notCalled(driver.isSimulator as sinon.SinonStub);
    });
  }

  for (const realDevice of [false, true]) {
    it(`delegates to mobileGetDeviceInfo once on ${realDevice ? 'physical devices' : 'simulators'}`, async () => {
      const {driver} = setup(true, !realDevice);
      const wda = sinon.stub().resolves({hasHinge: true});
      const client = {
        getDeviceInfo: sinon.stub().resolves({ProductType: 'device-model'}),
        close: sinon.stub().resolves(),
      };
      const create = sinon.stub(LockdownClient, 'createForDevice').resolves(client as any);
      (driver as any).remoteXPCFacade = {};
      driver.isRealDevice = () => realDevice;
      driver.proxyCommand = wda;
      driver.mobileGetDeviceInfo = mobileGetDeviceInfo.bind(driver);

      assert.deepEqual(await Promise.all([isDuo(driver), isDuo(driver)]), [true, true]);
      assert.equal(await isDuo(driver), true);
      sinon.assert.calledOnceWithExactly(wda, '/wda/device/info', 'GET');
      if (realDevice) {
        sinon.assert.calledOnceWithExactly(create, 'device', {facade: driver.remoteXPCFacade});
        sinon.assert.calledOnce(client.getDeviceInfo);
        sinon.assert.calledOnce(client.close);
      } else {
        sinon.assert.notCalled(create);
        sinon.assert.notCalled(client.getDeviceInfo);
        sinon.assert.notCalled(client.close);
      }
    });
  }

  it('also caches a non-Duo result', async () => {
    const {driver, getInfo} = setup(false);
    assert.equal(await isDuo(driver), false);
    assert.equal(await isDuo(driver), false);
    sinon.assert.calledOnce(getInfo);
  });

  it('does not enable the extension when older WDA omits hasHinge', async () => {
    const {driver, getInfo} = setup(undefined);
    getInfo.resolves({});
    assert.equal(await isDuo(driver), false);
  });

  it('requires the boolean true rather than a truthy value', async () => {
    for (const value of ['true', 1, null]) {
      assert.equal(await isDuo(setup(value).driver), false);
    }
  });

  it('fetches DeviceInfo again for a new session', async () => {
    const {driver, getInfo} = setup(true);
    assert.equal(await isDuo(driver), true);
    driver.sessionId = 'second-session';
    getInfo.resolves({hasHinge: false});
    assert.equal(await isDuo(driver), false);
    sinon.assert.calledTwice(getInfo);
  });

  it("does not reuse another device's result", async () => {
    const {driver, getInfo} = setup(true);
    assert.equal(await isDuo(driver), true);
    (driver as any).device = {udid: 'another-device'};
    getInfo.resolves({hasHinge: false});
    assert.equal(await isDuo(driver), false);
    sinon.assert.calledTwice(getInfo);
  });

  it('retries failed lookups instead of caching them', async () => {
    const {driver, getInfo} = setup(true);
    getInfo.onFirstCall().rejects(new Error('WDA disconnected'));
    await assert.rejects(isDuo(driver), /WDA disconnected/);
    assert.equal(await isDuo(driver), true);
    sinon.assert.calledTwice(getInfo);
  });

  it("does not let an old session's failure clear the new session cache", async () => {
    const {driver, getInfo} = setup(true);
    let rejectOld!: (err: Error) => void;
    getInfo.onFirstCall().returns(
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
    );
    const old = isDuo(driver);
    const rejected = assert.rejects(old, /Old session/);
    driver.sessionId = 'second-session';
    assert.equal(await isDuo(driver), true);
    rejectOld(new Error('Old session'));
    await rejected;
    assert.equal(await isDuo(driver), true);
    sinon.assert.calledTwice(getInfo);
  });
});
