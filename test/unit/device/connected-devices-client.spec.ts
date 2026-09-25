import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';

/** @ts-expect-error no types */
import {utilities} from 'appium-ios-device';
import {createSandbox} from 'sinon';
import type {SinonSandbox} from 'sinon';

import {ConnectedDevicesClient} from '../../../lib/device/connected-devices-client.js';
import {RemoteXPCFacade, type RemoteXPCServices} from '../../../lib/device/remote-xpc/index.js';
import type {XCUITestDriverOpts} from '../../../lib/driver.js';
import {log} from '../../../lib/logger.js';

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
    const getServices = sandbox
      .stub(RemoteXPCFacade, 'tryGetServicesStatic')
      .resolves({getAvailableDevices} as unknown as RemoteXPCServices);
    const warn = sandbox.stub(log, 'warn');
    const client = await ConnectedDevicesClient.create({platformVersion: '18.0'} as XCUITestDriverOpts);
    return {client, getAvailableDevices, getLegacyDevices, getServices, warn};
  }

  const outcomes = ['nonempty', 'empty', 'rejected'] as const;
  for (const tunnelOutcome of outcomes) {
    for (const legacyOutcome of outcomes) {
      it(`combines tunnel=${tunnelOutcome} and legacy=${legacyOutcome}`, async function () {
        const tunnelUdids = tunnelOutcome === 'nonempty' ? ['Tunnel-A'] : [];
        const legacyUdids = legacyOutcome === 'nonempty' ? ['Legacy-B'] : [];
        const {client, getAvailableDevices, getLegacyDevices, warn} = await createClient(tunnelUdids, legacyUdids);
        const tunnelError = new Error('tunnel lookup failed');
        const legacyError = new Error('legacy lookup failed');
        if (tunnelOutcome === 'rejected') {
          getAvailableDevices.rejects(tunnelError);
        }
        if (legacyOutcome === 'rejected') {
          getLegacyDevices.rejects(legacyError);
        }

        if (tunnelOutcome === 'rejected' && legacyOutcome === 'rejected') {
          await assert.rejects(client.getConnectedDevices(), (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.match(error.message, /tunnel lookup failed/);
            assert.match(error.message, /legacy lookup failed/);
            assert.ok(error.cause instanceof AggregateError);
            assert.deepEqual(error.cause.errors, [tunnelError, legacyError]);
            return true;
          });
        } else {
          assert.deepEqual(await client.getConnectedDevices(), [...legacyUdids, ...tunnelUdids]);
          const oneFailed = tunnelOutcome === 'rejected' || legacyOutcome === 'rejected';
          assert.equal(warn.callCount, oneFailed ? 1 : 0);
          if (legacyOutcome === 'rejected') {
            assert.match(String(warn.firstCall.args[0]), /legacy lookup failed/);
          }
        }
        assert.equal(getAvailableDevices.callCount, 1);
        assert.equal(getLegacyDevices.callCount, 1);
      });
    }
  }

  it('retains a device whose tunnel disappeared while another tunnel remains', async function () {
    const {client} = await createClient(['Device-A'], ['Device-A', 'Device-B']);
    assert.deepEqual(await client.getConnectedDevices(), ['Device-B', 'Device-A']);
  });

  it('deduplicates case-insensitively with tunnel spelling and a final tunnel block', async function () {
    const {client} = await createClient(
      ['Tunnel-A', 'tunnel-a', 'Tunnel-B'],
      ['Legacy-A', 'legacy-a', 'TUNNEL-A', 'Legacy-B', 'TUNNEL-B'],
    );
    assert.deepEqual(await client.getConnectedDevices(), ['Legacy-A', 'Legacy-B', 'Tunnel-A', 'Tunnel-B']);
  });

  it('does not mutate either source list', async function () {
    const tunnels = ['Device-A', 'device-a'];
    const legacy = ['device-a', 'Device-B', 'device-b'];
    Object.freeze(tunnels);
    Object.freeze(legacy);
    const {client} = await createClient(tunnels, legacy);
    assert.deepEqual(await client.getConnectedDevices(), ['Device-B', 'Device-A']);
    assert.deepEqual(tunnels, ['Device-A', 'device-a']);
    assert.deepEqual(legacy, ['device-a', 'Device-B', 'device-b']);
  });

  it('normalizes non-Error rejection messages and retains both original causes', async function () {
    const {client, getAvailableDevices, getLegacyDevices} = await createClient([], []);
    getAvailableDevices.callsFake(() => Promise.reject('registry unavailable'));
    getLegacyDevices.callsFake(() => Promise.reject(42));
    await assert.rejects(client.getConnectedDevices(), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /registry unavailable/);
      assert.match(error.message, /42/);
      assert.ok(error.cause instanceof AggregateError);
      assert.deepEqual(error.cause.errors, ['registry unavailable', 42]);
      return true;
    });
  });

  it('uses the legacy list when RemoteXPC services cannot be loaded', async function () {
    const {getServices, getAvailableDevices, getLegacyDevices, warn} = await createClient([], ['Legacy-B']);
    getServices.resolves(null);
    const client = await ConnectedDevicesClient.create({platformVersion: '17.0'} as XCUITestDriverOpts);
    assert.deepEqual(await client.getConnectedDevices(), ['Legacy-B']);
    assert.equal(getAvailableDevices.callCount, 0);
    assert.equal(getLegacyDevices.callCount, 1);
    assert.equal(warn.callCount, 1);
  });

  it('refreshes both sources between calls instead of retaining stale tunnel membership', async function () {
    const {client, getAvailableDevices} = await createClient(['Device-A', 'Device-B'], ['Device-A', 'Device-B']);
    assert.deepEqual(await client.getConnectedDevices(), ['Device-A', 'Device-B']);
    getAvailableDevices.resolves(['Device-A']);
    assert.deepEqual(await client.getConnectedDevices(), ['Device-B', 'Device-A']);
    assert.equal(getAvailableDevices.callCount, 2);
  });
});
