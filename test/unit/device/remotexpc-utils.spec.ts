import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  formatTunnelAvailabilityMessage,
  isTunnelAvailabilityError,
  REMOTE_XPC_TUNNEL_SETUP_DOC_LINK,
  TUNNEL_CREATION_COMMAND,
  TunnelRequiredError,
  isTunnelRequiredError,
  wrapRemoteXPCConnectionError,
} from '../../../lib/device/remote-xpc/utils.js';

describe('remotexpc-utils tunnel availability', function () {
  it('detects TunnelAvailabilityError by ERR_TUNNEL_AVAILABILITY code', function () {
    assert.strictEqual(isTunnelAvailabilityError({code: 'ERR_TUNNEL_AVAILABILITY'}), true);
  });

  it('formatTunnelAvailabilityMessage includes tunnel command and doc link', function () {
    const err = new Error('Tunnel registry at 127.0.0.1:42314 is not reachable');
    err.name = 'TunnelAvailabilityError';
    const msg = formatTunnelAvailabilityMessage(err);
    assert.ok(msg.includes('Tunnel registry at 127.0.0.1:42314 is not reachable'));
    assert.ok(msg.includes(TUNNEL_CREATION_COMMAND));
    assert.ok(msg.includes(REMOTE_XPC_TUNNEL_SETUP_DOC_LINK));
  });

  it('formatTunnelAvailabilityMessage avoids repeating tunnel script hint', function () {
    const err = new Error('No tunnel found for device ABC. Please run the tunnel creation script first');
    err.name = 'TunnelAvailabilityError';
    const msg = formatTunnelAvailabilityMessage(err);
    assert.ok(msg.includes('Please run the tunnel creation script first'));
    assert.ok(!msg.includes(TUNNEL_CREATION_COMMAND));
    assert.ok(msg.includes(REMOTE_XPC_TUNNEL_SETUP_DOC_LINK));
  });

  it('wrapRemoteXPCConnectionError adds tunnel guidance for tunnel failures', function () {
    const err = new Error('No tunnel found for device ABC');
    err.name = 'TunnelAvailabilityError';
    const wrapped = wrapRemoteXPCConnectionError(err, 'Failed to start syslog');
    assert.match(wrapped.message, /Failed to start syslog \(/);
    assert.ok(wrapped.message.includes(REMOTE_XPC_TUNNEL_SETUP_DOC_LINK));
    assert.strictEqual(wrapped.cause, err);
  });

  it('wrapRemoteXPCConnectionError preserves non-tunnel errors', function () {
    const err = new Error('RSD timeout');
    const wrapped = wrapRemoteXPCConnectionError(err, 'Failed to start DVT');
    assert.strictEqual(wrapped.message, 'Failed to start DVT (RSD timeout)');
    assert.strictEqual(wrapped.cause, err);
  });

  it('TunnelRequiredError does not suggest a tunnel on platform versions that cannot have one', function () {
    const err = new TunnelRequiredError('pasteboard', 'udid-1', '17.5');
    assert.match(err.message, /not supported for 'udid-1' on iOS\/tvOS 17.5/);
    assert.ok(!err.message.includes(TUNNEL_CREATION_COMMAND));
  });

  it('TunnelRequiredError names the feature and the device and is a tunnel availability error', function () {
    const err = new TunnelRequiredError('crash reports', 'udid-1');
    assert.ok(isTunnelRequiredError(err));
    assert.ok(isTunnelAvailabilityError(err));
    assert.match(err.message, /crash reports requires a RemoteXPC tunnel for 'udid-1'/);
    assert.ok(err.message.includes(TUNNEL_CREATION_COMMAND));
    assert.ok(err.message.includes(REMOTE_XPC_TUNNEL_SETUP_DOC_LINK));
  });

  it('formatTunnelAvailabilityMessage leaves TunnelRequiredError messages untouched', function () {
    const modern = new TunnelRequiredError('crash reports', 'udid-1', '18.0');
    assert.strictEqual(formatTunnelAvailabilityMessage(modern), modern.message);
    const legacy = new TunnelRequiredError('pasteboard', 'udid-1', '17.5');
    assert.strictEqual(formatTunnelAvailabilityMessage(legacy), legacy.message);
  });
});
