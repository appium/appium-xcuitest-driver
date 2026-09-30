import assert from 'node:assert/strict';
import {describe, it, afterEach, mock} from 'node:test';

import sinon from 'sinon';

import * as moduleLoaderModule from '../../../lib/device/remote-xpc/module-loader.js';
import * as usbmuxUtilsModule from '../../../lib/device/remote-xpc/usbmux-utils.js';

let currentTryLoadRemoteXPCModule: (...args: any[]) => any = async () => null;
let currentIsDeviceListedInUsbmux: (...args: any[]) => any = async () => false;

mock.module('../../../lib/device/remote-xpc/module-loader.js', {
  namedExports: {
    ...moduleLoaderModule,
    tryLoadRemoteXPCModule: (...args: any[]) => currentTryLoadRemoteXPCModule(...args),
  },
});
mock.module('../../../lib/device/remote-xpc/usbmux-utils.js', {
  namedExports: {
    ...usbmuxUtilsModule,
    isDeviceListedInUsbmux: (...args: any[]) => currentIsDeviceListedInUsbmux(...args),
  },
});

const {RemoteXPCFacade} = await import('../../../lib/device/remote-xpc/index.js');

describe('RemoteXPCFacade', function () {
  afterEach(function () {
    sinon.restore();
    currentTryLoadRemoteXPCModule = async () => null;
    currentIsDeviceListedInUsbmux = async () => false;
  });

  describe('describeUnavailability', function () {
    const makeFacade = () =>
      new RemoteXPCFacade('udid-1', '18.0', {debug: sinon.stub(), warn: sinon.stub(), info: sinon.stub()} as any, true);

    it('tells the caller to start a tunnel when the package is present', async function () {
      currentTryLoadRemoteXPCModule = async () => ({Services: {}}) as any;

      const message = await makeFacade().describeUnavailability('Some feature has no fallback.');

      assert.match(message, /No RemoteXPC tunnel is available for 'udid-1'/);
      assert.match(message, /appium driver run xcuitest tunnel-creation/);
      assert.match(message, /Some feature has no fallback\./);
      assert.match(message, /remotexpc-tunnels-real-devices/);
    });

    it('tells the caller to install the package when it cannot be loaded', async function () {
      currentTryLoadRemoteXPCModule = async () => null;

      const message = await makeFacade().describeUnavailability('Some feature has no fallback.');

      assert.match(message, /appium-ios-remotexpc package could not be loaded/);
      assert.match(message, /Install it, then start a tunnel with/);
      assert.match(message, /Some feature has no fallback\./);
    });
  });

  it('returns false when the session is not eligible', async function () {
    const access = new RemoteXPCFacade(
      'udid-1',
      '17.0',
      {debug: sinon.stub(), warn: sinon.stub(), info: sinon.stub()} as any,
      true,
    );

    assert.strictEqual(await access.determineAvailability(), false);
  });

  it('caches tunnel unavailability for the remainder of the session when init probe fails', async function () {
    const tunnelErr = new Error('No tunnel found for device udid-1');
    tunnelErr.name = 'TunnelAvailabilityError';

    currentTryLoadRemoteXPCModule = sinon.stub().resolves({
      Services: {
        getTunnelForDevice: sinon.stub().rejects(tunnelErr),
      },
    } as any);
    currentIsDeviceListedInUsbmux = sinon.stub().resolves(false);

    const warn = sinon.stub();
    const access = new RemoteXPCFacade('udid-1', '18.0', {debug: sinon.stub(), warn, info: sinon.stub()} as any, true);

    assert.strictEqual(await access.determineAvailability(), false);
    assert.strictEqual(await access.determineAvailability(), false);
    assert.strictEqual(warn.calledOnce, true);
    assert.strictEqual((currentTryLoadRemoteXPCModule as sinon.SinonStub).calledOnce, true);
  });

  it('does not disable remotexpc when a later service call hits a tunnel error', async function () {
    const tunnelErr = new Error('No tunnel found for device udid-1');
    tunnelErr.name = 'TunnelAvailabilityError';
    const operation = sinon.stub().rejects(tunnelErr);
    const services = {operation};

    currentTryLoadRemoteXPCModule = sinon.stub().resolves({
      Services: {
        getTunnelForDevice: sinon.stub().resolves({}),
        ...services,
      },
    } as any);
    currentIsDeviceListedInUsbmux = sinon.stub().resolves(false);

    const warn = sinon.stub();
    const access = new RemoteXPCFacade('udid-1', '18.0', {debug: sinon.stub(), warn, info: sinon.stub()} as any, true);

    assert.strictEqual(await access.determineAvailability(), true);
    assert.strictEqual(await access.attemptService('test feature', operation), null);
    assert.strictEqual(await access.determineAvailability(), true);
    assert.strictEqual(warn.calledOnce, true);
    assert.strictEqual(operation.calledOnce, true);
  });

  it('requireService throws when remotexpc is disabled', async function () {
    const tunnelErr = new Error('No tunnel found for device udid-1');
    tunnelErr.name = 'TunnelAvailabilityError';

    currentTryLoadRemoteXPCModule = sinon.stub().resolves({
      Services: {
        getTunnelForDevice: sinon.stub().rejects(tunnelErr),
      },
    } as any);
    currentIsDeviceListedInUsbmux = sinon.stub().resolves(false);

    const access = new RemoteXPCFacade(
      'udid-1',
      '18.0',
      {debug: sinon.stub(), warn: sinon.stub(), info: sinon.stub()} as any,
      true,
    );

    await access.determineAvailability();
    try {
      await access.requireService('test feature', async () => 'ok');
      assert.fail('expected requireService to throw');
    } catch (err: any) {
      assert.ok(err.message.includes('test feature'));
    }
  });
});
