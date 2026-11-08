import assert from 'node:assert/strict';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {isDuo} from '../../../lib/commands/helpers/duo.js';
import type {XCUITestDriver} from '../../../lib/driver.js';

describe('Duo identification from DeviceInfo', () => {
  afterEach(() => sinon.restore());

  function setup(hasHinge: unknown, simulator = true) {
    const proxy = sinon.stub().resolves({hasHinge});
    const driver = {
      sessionId: 'first-session',
      device: {udid: 'device'},
      isSimulator: sinon.stub().returns(simulator),
      proxyCommand: proxy,
    } as unknown as XCUITestDriver;
    return {driver, proxy};
  }

  for (const simulator of [true, false]) {
    it(`uses and caches WDA DeviceInfo on ${simulator ? 'simulators' : 'physical devices'}`, async () => {
      const {driver, proxy} = setup(true, simulator);
      assert.deepEqual(await Promise.all([isDuo(driver), isDuo(driver)]), [true, true]);
      assert.equal(await isDuo(driver), true);
      sinon.assert.calledOnceWithExactly(proxy, '/wda/device/info', 'GET');
      sinon.assert.notCalled(driver.isSimulator as sinon.SinonStub);
    });
  }

  it('also caches a non-Duo result', async () => {
    const {driver, proxy} = setup(false);
    assert.equal(await isDuo(driver), false);
    assert.equal(await isDuo(driver), false);
    sinon.assert.calledOnce(proxy);
  });

  it('does not enable the extension when older WDA omits hasHinge', async () => {
    const {driver, proxy} = setup(undefined);
    proxy.resolves({});
    assert.equal(await isDuo(driver), false);
  });

  it('requires the boolean true rather than a truthy value', async () => {
    for (const value of ['true', 1, null]) {
      assert.equal(await isDuo(setup(value).driver), false);
    }
  });

  it('fetches DeviceInfo again for a new session', async () => {
    const {driver, proxy} = setup(true);
    assert.equal(await isDuo(driver), true);
    driver.sessionId = 'second-session';
    proxy.resolves({hasHinge: false});
    assert.equal(await isDuo(driver), false);
    sinon.assert.calledTwice(proxy);
  });

  it("does not reuse another device's result", async () => {
    const {driver, proxy} = setup(true);
    assert.equal(await isDuo(driver), true);
    (driver as any).device = {udid: 'another-device'};
    proxy.resolves({hasHinge: false});
    assert.equal(await isDuo(driver), false);
    sinon.assert.calledTwice(proxy);
  });

  it('retries failed lookups instead of caching them', async () => {
    const {driver, proxy} = setup(true);
    proxy.onFirstCall().rejects(new Error('WDA disconnected'));
    await assert.rejects(isDuo(driver), /WDA disconnected/);
    assert.equal(await isDuo(driver), true);
    sinon.assert.calledTwice(proxy);
  });

  it("does not let an old session's failure clear the new session cache", async () => {
    const {driver, proxy} = setup(true);
    let rejectOld!: (err: Error) => void;
    proxy.onFirstCall().returns(
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
    sinon.assert.calledTwice(proxy);
  });
});
