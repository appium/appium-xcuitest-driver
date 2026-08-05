import assert from 'node:assert/strict';
import {describe, it, beforeEach} from 'node:test';

import {logger} from 'appium/support.js';

import {DeviceConnectionsFactory} from '../../lib/device/device-connections-factory.js';
import {RemoteXPCUnavailableError} from '../../lib/device/remote-xpc/utils.js';

describe('DeviceConnectionsFactory', function () {
  let devConFactory: DeviceConnectionsFactory;

  beforeEach(function () {
    devConFactory = new DeviceConnectionsFactory(logger.getLogger('DevCon Factory test'));
    (DeviceConnectionsFactory as any)._connectionsMapping = {};
  });

  it('should properly transform udid/part pairs to keys', function () {
    const f = devConFactory as any;
    assert.strictEqual(f._toKey('udid', 1234), 'udid:1234');
    assert.strictEqual(f._toKey('udid', 0), 'udid:0');
    assert.strictEqual(f._toKey('udid'), 'udid:');
    assert.strictEqual(f._toKey(null, 456), ':456');
    assert.strictEqual(f._toKey(), ':');
  });

  it('should properly list connections by udid/port', function () {
    (DeviceConnectionsFactory as any)._connectionsMapping = {
      'udid:1234': {},
      'udid2:5678': {},
      'udid4:5678': {},
      'udid:8765': {},
      'udid5:9876': {},
    };
    assert.deepStrictEqual(devConFactory.listConnections('udid', 1234), ['udid:1234', 'udid:8765']);
    assert.deepStrictEqual(devConFactory.listConnections('udid', 1234, true), ['udid:1234']);
    assert.deepStrictEqual(devConFactory.listConnections('udid', null, true), ['udid:1234', 'udid:8765']);
    assert.deepStrictEqual(devConFactory.listConnections('udid2'), ['udid2:5678']);
    assert.deepStrictEqual(devConFactory.listConnections(null, 5678), ['udid2:5678', 'udid4:5678']);
    assert.deepStrictEqual(devConFactory.listConnections(null, 9876), ['udid5:9876']);
    assert.deepStrictEqual(devConFactory.listConnections(null, 9876, true), ['udid5:9876']);
    assert.deepStrictEqual(devConFactory.listConnections(), []);
    assert.deepStrictEqual(devConFactory.listConnections('asd'), []);
    assert.deepStrictEqual(devConFactory.listConnections('asd', 23424), []);
    assert.deepStrictEqual(devConFactory.listConnections(null, 23424), []);
  });

  it('should properly release proxied connections', async function () {
    (DeviceConnectionsFactory as any)._connectionsMapping = {
      'udid:1234': {portForwarder: {stop: () => {}}},
      'udid:5678': {},
      'udid4:6545': {portForwarder: {stop: () => {}}},
    };

    const f = devConFactory as any;
    assert.deepStrictEqual(
      await f._releaseProxiedConnections(Object.keys((DeviceConnectionsFactory as any)._connectionsMapping)),
      ['udid:1234', 'udid4:6545'],
    );
  });

  it('should use legacy port forwarding if RemoteXPC is ineligible', async function () {
    const f = devConFactory as any;
    const portForwarder = await f._createPortForwarder('udid', 1234, 8100, {eligible: false});

    assert.strictEqual(typeof portForwarder.start, 'function');
    assert.strictEqual(typeof portForwarder.stop, 'function');
  });

  it('should fall back to legacy port forwarding if RemoteXPC is unavailable', async function () {
    const f = devConFactory as any;
    const remoteXPCFacade = {
      eligible: true,
      createDevicePortForwarder: async () => {
        throw new RemoteXPCUnavailableError('No tunnel');
      },
    };

    const portForwarder = await f._createPortForwarder('udid', 1234, 8100, remoteXPCFacade);

    assert.strictEqual(typeof portForwarder.start, 'function');
    assert.strictEqual(typeof portForwarder.stop, 'function');
  });
});
