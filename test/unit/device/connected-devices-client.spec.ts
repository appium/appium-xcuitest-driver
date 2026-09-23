import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';

/** @ts-expect-error no types */
import {utilities} from 'appium-ios-device';
import {createSandbox} from 'sinon';
import type {SinonSandbox} from 'sinon';

import {ConnectedDevicesClient} from '../../../lib/device/connected-devices-client.js';
import {RemoteXPCFacade, type RemoteXPCServices} from '../../../lib/device/remote-xpc/index.js';
import type {XCUITestDriverOpts} from '../../../lib/driver.js';

describe('connected real-device discovery', function () {
  let sandbox: SinonSandbox;
  let preferDevicectl: string | undefined;

  beforeEach(function () {
    sandbox = createSandbox();
    preferDevicectl = process.env.APPIUM_XCUITEST_PREFER_DEVICECTL;
    delete process.env.APPIUM_XCUITEST_PREFER_DEVICECTL;
  });

  afterEach(function () {
    sandbox.restore();
    if (preferDevicectl === undefined) {
      delete process.env.APPIUM_XCUITEST_PREFER_DEVICECTL;
    } else {
      process.env.APPIUM_XCUITEST_PREFER_DEVICECTL = preferDevicectl;
    }
  });

  async function createClient(tunnelUdids: string[], legacyUdids: string[]) {
    const getAvailableDevices = sandbox.stub().resolves(tunnelUdids);
    const getLegacyDevices = sandbox.stub(utilities, 'getConnectedDevices').resolves(legacyUdids);
    sandbox
      .stub(RemoteXPCFacade, 'tryGetServicesStatic')
      .resolves({getAvailableDevices} as unknown as RemoteXPCServices);
    const client = await ConnectedDevicesClient.create({platformVersion: '18.0'} as XCUITestDriverOpts);
    return {client, getAvailableDevices, getLegacyDevices};
  }

  it('uses legacy devices when the reachable tunnel registry is empty', async function () {
    const {client, getAvailableDevices, getLegacyDevices} = await createClient([], ['legacy-udid']);

    assert.deepEqual(await client.getConnectedDevices(), ['legacy-udid']);
    assert.strictEqual(getAvailableDevices.calledOnce, true);
    assert.strictEqual(getLegacyDevices.calledOnce, true);
  });

  it('prefers nonempty tunnel results over legacy devices', async function () {
    const {client, getLegacyDevices} = await createClient(['tunnel-udid'], ['legacy-udid']);

    assert.deepEqual(await client.getConnectedDevices(), ['tunnel-udid']);
    assert.strictEqual(getLegacyDevices.calledOnce, true);
  });

  it('returns an empty list when both sources report no devices', async function () {
    const {client} = await createClient([], []);

    assert.deepEqual(await client.getConnectedDevices(), []);
  });

  it('propagates a legacy lookup error when the tunnel registry is empty', async function () {
    const {client, getLegacyDevices} = await createClient([], []);
    getLegacyDevices.rejects(new Error('legacy lookup failed'));

    await assert.rejects(client.getConnectedDevices(), /legacy lookup failed/);
  });
});
