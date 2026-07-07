import {expect} from 'chai';

import {
  formatRemoteXPCFallbackLog,
  formatTunnelAvailabilityMessage,
  isTunnelAvailabilityError,
  REMOTE_XPC_TUNNEL_SETUP_DOC_LINK,
  TUNNEL_CREATION_COMMAND,
  wrapRemoteXPCConnectionError,
} from '../../../lib/device/remote-xpc/utils';

describe('remotexpc-utils tunnel availability', function () {
  it('detects TunnelAvailabilityError by ERR_TUNNEL_AVAILABILITY code', function () {
    expect(isTunnelAvailabilityError({code: 'ERR_TUNNEL_AVAILABILITY'})).to.equal(true);
  });

  it('formatTunnelAvailabilityMessage includes tunnel command and doc link', function () {
    const err = new Error('Tunnel registry at 127.0.0.1:42314 is not reachable');
    err.name = 'TunnelAvailabilityError';
    const msg = formatTunnelAvailabilityMessage(err);
    expect(msg).to.include('Tunnel registry at 127.0.0.1:42314 is not reachable');
    expect(msg).to.include(TUNNEL_CREATION_COMMAND);
    expect(msg).to.include(REMOTE_XPC_TUNNEL_SETUP_DOC_LINK);
  });

  it('formatTunnelAvailabilityMessage avoids repeating tunnel script hint', function () {
    const err = new Error('No tunnel found for device ABC. Please run the tunnel creation script first');
    err.name = 'TunnelAvailabilityError';
    const msg = formatTunnelAvailabilityMessage(err);
    expect(msg).to.include('Please run the tunnel creation script first');
    expect(msg).to.not.include(TUNNEL_CREATION_COMMAND);
    expect(msg).to.include(REMOTE_XPC_TUNNEL_SETUP_DOC_LINK);
  });

  it('wrapRemoteXPCConnectionError adds tunnel guidance for tunnel failures', function () {
    const err = new Error('No tunnel found for device ABC');
    err.name = 'TunnelAvailabilityError';
    const wrapped = wrapRemoteXPCConnectionError(err, 'Failed to start syslog');
    expect(wrapped.message).to.match(/Failed to start syslog \(/);
    expect(wrapped.message).to.include(REMOTE_XPC_TUNNEL_SETUP_DOC_LINK);
    expect(wrapped.cause).to.equal(err);
  });

  it('wrapRemoteXPCConnectionError preserves non-tunnel errors', function () {
    const err = new Error('RSD timeout');
    const wrapped = wrapRemoteXPCConnectionError(err, 'Failed to start DVT');
    expect(wrapped.message).to.equal('Failed to start DVT (RSD timeout)');
    expect(wrapped.cause).to.equal(err);
  });

  it('formatRemoteXPCFallbackLog uses tunnel guidance when applicable', function () {
    const err = new Error('registry down');
    (err as any).code = 'ERR_TUNNEL_AVAILABILITY';
    const msg = formatRemoteXPCFallbackLog('AFC', err);
    expect(msg).to.match(/RemoteXPC AFC unavailable:/);
    expect(msg).to.include(REMOTE_XPC_TUNNEL_SETUP_DOC_LINK);
    expect(msg).to.include('Falling back to appium-ios-device.');
  });
});
