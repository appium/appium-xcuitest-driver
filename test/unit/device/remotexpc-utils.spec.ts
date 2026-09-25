import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  formatRemoteXPCFallbackLog,
  formatTunnelAvailabilityMessage,
  isTunnelAvailabilityError,
  REMOTE_XPC_TUNNEL_SETUP_DOC_LINK,
  TUNNEL_CREATION_COMMAND,
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

  it('formatRemoteXPCFallbackLog uses tunnel guidance when applicable', function () {
    const err = new Error('registry down');
    (err as any).code = 'ERR_TUNNEL_AVAILABILITY';
    const msg = formatRemoteXPCFallbackLog('AFC', err);
    assert.match(msg, /RemoteXPC AFC unavailable:/);
    assert.ok(msg.includes(REMOTE_XPC_TUNNEL_SETUP_DOC_LINK));
    assert.ok(msg.includes('Falling back to appium-ios-device.'));
  });
});
