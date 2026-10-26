import assert from 'node:assert/strict';
import {describe, it, afterEach, mock} from 'node:test';

import sinon from 'sinon';

import * as moduleLoaderModule from '../../../lib/device/remote-xpc/module-loader.js';
import * as usbmuxUtilsModule from '../../../lib/device/remote-xpc/usbmux-utils.js';

let currentLoadRemoteXPCModule: (...args: any[]) => any = async () => {
  throw new Error('Cannot find package');
};
let currentIsDeviceListedInUsbmux: (...args: any[]) => any = async () => false;

mock.module('../../../lib/device/remote-xpc/module-loader.js', {
  namedExports: {
    ...moduleLoaderModule,
    loadRemoteXPCModule: (...args: any[]) => currentLoadRemoteXPCModule(...args),
  },
});
mock.module('../../../lib/device/remote-xpc/usbmux-utils.js', {
  namedExports: {
    ...usbmuxUtilsModule,
    isDeviceListedInUsbmux: (...args: any[]) => currentIsDeviceListedInUsbmux(...args),
  },
});

const {RemoteXPCFacade, isTunnelRequiredError} = await import('../../../lib/device/remote-xpc/index.js');

function makeLog() {
  return {debug: sinon.stub(), warn: sinon.stub(), info: sinon.stub()};
}

function setModule(transports: {tunnel: boolean; usbmux: boolean}, extraServices: Record<string, any> = {}) {
  const getAvailableTransports = sinon.stub().resolves(transports);
  currentLoadRemoteXPCModule = sinon.stub().resolves({
    Services: {getAvailableTransports, ...extraServices},
  } as any);
  return getAvailableTransports;
}

function makeFacade(platformVersion: string | undefined = '18.0', log = makeLog()) {
  return {facade: new RemoteXPCFacade('udid-1', platformVersion, log as any), log};
}

describe('RemoteXPCFacade', function () {
  afterEach(function () {
    sinon.restore();
    currentLoadRemoteXPCModule = async () => {
      throw new Error('Cannot find package');
    };
    currentIsDeviceListedInUsbmux = async () => false;
  });

  describe('tier selection', function () {
    it('prefers the tunnel whenever it is available, even if usbmux is too', async function () {
      setModule({tunnel: true, usbmux: true});
      const {facade, log} = makeFacade();

      assert.strictEqual(await facade.getTier(), 'tunnel');
      assert.strictEqual(await facade.isTunnelTier(), true);
      assert.strictEqual(log.warn.called, false);
    });

    it('falls back to usbmux with a one-time warning when there is no tunnel', async function () {
      setModule({tunnel: false, usbmux: true});
      const {facade, log} = makeFacade();

      assert.strictEqual(await facade.getTier(), 'usbmux');
      assert.strictEqual(await facade.getTier(), 'usbmux');
      assert.strictEqual(log.warn.calledOnce, true);
      assert.match(log.warn.firstCall.args[0], /temporary and limited/);
    });

    it('uses usbmux for platform versions that have no tunnel services', async function () {
      const getAvailableTransports = setModule({tunnel: true, usbmux: true});
      const {facade} = makeFacade('17.5');

      assert.strictEqual(await facade.getTier(), 'usbmux');
      assert.strictEqual(getAvailableTransports.calledOnce, true);
    });

    it('does not wait for a tunnel on platform versions that cannot have one', async function () {
      const getAvailableTransports = setModule({tunnel: false, usbmux: true});
      const {facade} = makeFacade('17.5');

      await facade.getTier();
      assert.deepStrictEqual(getAvailableTransports.firstCall.args.slice(1), [[], {tunnelWaitMs: 0}]);
    });

    it('decides once per session', async function () {
      const getAvailableTransports = setModule({tunnel: false, usbmux: true});
      const {facade} = makeFacade();

      await facade.getTier();
      getAvailableTransports.resolves({tunnel: true, usbmux: true});
      assert.strictEqual(await facade.getTier(), 'usbmux');
      assert.strictEqual(getAvailableTransports.calledOnce, true);
    });

    it('fails when the device is reachable neither through a tunnel nor over usbmux, and retries later', async function () {
      const getAvailableTransports = setModule({tunnel: false, usbmux: false});
      const {facade} = makeFacade();

      await assert.rejects(facade.getTier(), /neither through a RemoteXPC tunnel nor over usbmux/);
      getAvailableTransports.resolves({tunnel: true, usbmux: false});
      assert.strictEqual(await facade.getTier(), 'tunnel');
    });

    it('fails clearly when the module cannot be loaded', async function () {
      currentLoadRemoteXPCModule = async () => {
        throw new Error('Cannot find package');
      };
      const {facade} = makeFacade();

      await assert.rejects(facade.getTier(), /RemoteXPC module is not available/);
    });
  });

  describe('requireService', function () {
    it('passes the session tier to the operation', async function () {
      setModule({tunnel: false, usbmux: true});
      const {facade} = makeFacade();
      const operation = sinon.stub().resolves('ok');

      assert.strictEqual(await facade.requireService('AFC', operation), 'ok');
      assert.deepStrictEqual(operation.firstCall.args[1], {transport: 'usbmux'});
    });

    it('turns tunnel errors on the usbmux tier into TunnelRequiredError', async function () {
      setModule({tunnel: false, usbmux: true});
      const {facade} = makeFacade();
      const tunnelErr = Object.assign(new Error('not served over usbmux'), {code: 'ERR_TUNNEL_AVAILABILITY'});

      await assert.rejects(
        facade.requireService('thing', async () => {
          throw tunnelErr;
        }),
        (err: Error) => isTunnelRequiredError(err),
      );
    });

    it('adds the tunnel setup hint to tunnel errors on the tunnel tier', async function () {
      setModule({tunnel: true, usbmux: false});
      const {facade} = makeFacade();
      const tunnelErr = Object.assign(new Error('tunnel went away'), {code: 'ERR_TUNNEL_AVAILABILITY'});

      await assert.rejects(
        facade.requireService('AFC', async () => {
          throw tunnelErr;
        }),
        (err: Error) => err.message.includes('Failed AFC via RemoteXPC') && err.message.includes('tunnel-creation'),
      );
      assert.strictEqual(await facade.getTier(), 'tunnel');
    });
  });

  describe('requireTunnelService', function () {
    it('runs the operation on the tunnel tier', async function () {
      const startDVTService = sinon.stub().resolves('dvt');
      setModule({tunnel: true, usbmux: true}, {startDVTService});
      const {facade} = makeFacade();

      assert.strictEqual(
        await facade.requireTunnelService('DVT', (Services) => Services.startDVTService('udid-1')),
        'dvt',
      );
    });

    it('throws TunnelRequiredError on the usbmux tier without running the operation', async function () {
      setModule({tunnel: false, usbmux: true});
      const {facade} = makeFacade();
      const operation = sinon.stub().resolves('ok');

      await assert.rejects(
        facade.requireTunnelService('crash reports', operation),
        (err: Error) => isTunnelRequiredError(err) && err.message.includes('crash reports'),
      );
      assert.strictEqual(operation.called, false);
    });
  });

  describe('lockdown strategy', function () {
    it('uses usbmux lockdown when the device is listed there, without deciding the tier', async function () {
      const getAvailableTransports = setModule({tunnel: false, usbmux: false});
      currentIsDeviceListedInUsbmux = sinon.stub().resolves(true);
      const {facade} = makeFacade();

      assert.strictEqual(await facade.resolveLockdownStrategy(), 'remotexpc-usbmux');
      assert.strictEqual(getAvailableTransports.called, false);
    });

    it('does not cache a negative usbmux listing for the session', async function () {
      setModule({tunnel: true, usbmux: true});
      currentIsDeviceListedInUsbmux = sinon.stub().onFirstCall().resolves(false).onSecondCall().resolves(true);
      const {facade} = makeFacade();

      assert.strictEqual(await facade.resolveLockdownStrategy(), 'remotexpc-tunnel');
      assert.strictEqual(await facade.resolveLockdownStrategy(), 'remotexpc-usbmux');
      assert.strictEqual(await facade.resolveLockdownStrategy(), 'remotexpc-usbmux');
      assert.strictEqual((currentIsDeviceListedInUsbmux as sinon.SinonStub).calledTwice, true);
    });

    it('uses tunnel lockdown for devices that usbmux does not list', async function () {
      setModule({tunnel: true, usbmux: false});
      const {facade} = makeFacade();

      assert.strictEqual(await facade.resolveLockdownStrategy(), 'remotexpc-tunnel');
    });
  });

  describe('createDevicePortForwarder', function () {
    function setForwarderModule(transports: {tunnel: boolean; usbmux: boolean}) {
      const connectViaTunnel = sinon.stub().resolves('tunnel-socket');
      const connectViaUsbmux = sinon.stub().resolves('usbmux-socket');
      class DevicePortForwarder {
        constructor(
          readonly localPort: number,
          readonly devicePort: number,
          readonly opts: {primaryConnector: () => Promise<unknown>},
        ) {}
      }
      currentLoadRemoteXPCModule = sinon.stub().resolves({
        DevicePortForwarder,
        connectViaTunnel,
        connectViaUsbmux,
        Services: {getAvailableTransports: sinon.stub().resolves(transports)},
      });
      return {connectViaTunnel, connectViaUsbmux};
    }

    it('returns a forwarder over the tunnel when the session has one', async function () {
      const {connectViaTunnel, connectViaUsbmux} = setForwarderModule({tunnel: true, usbmux: false});
      const {facade} = makeFacade();

      const forwarder = await facade.createDevicePortForwarder(8100, 8100);
      await (forwarder as any).opts.primaryConnector();
      assert.strictEqual(connectViaTunnel.calledOnce, true);
      assert.strictEqual(connectViaUsbmux.called, false);
    });

    it('uses usbmux on a usbmux session even if the usbmuxd listing query came back empty', async function () {
      const {connectViaTunnel, connectViaUsbmux} = setForwarderModule({tunnel: false, usbmux: true});
      const {facade} = makeFacade();

      const forwarder = await facade.createDevicePortForwarder(8100, 8100);
      await (forwarder as any).opts.primaryConnector();
      assert.strictEqual(connectViaUsbmux.calledOnce, true);
      assert.strictEqual(connectViaTunnel.called, false);
    });

    it('fails early when the device is reachable through neither transport', async function () {
      setForwarderModule({tunnel: false, usbmux: false});
      const {facade} = makeFacade();

      await assert.rejects(facade.createDevicePortForwarder(8100, 8100), /reachable neither/);
    });
  });
});
