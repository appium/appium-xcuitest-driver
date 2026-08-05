import {describe, it, afterEach, mock} from 'node:test';

import {expect} from 'chai';
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

  it('returns false when the session is not eligible', async function () {
    const access = new RemoteXPCFacade(
      'udid-1',
      '17.0',
      {debug: sinon.stub(), warn: sinon.stub(), info: sinon.stub()} as any,
      true,
    );

    expect(await access.determineAvailability()).to.equal(false);
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

    expect(await access.determineAvailability()).to.equal(false);
    expect(await access.determineAvailability()).to.equal(false);
    expect(warn.calledOnce).to.be.true;
    expect((currentTryLoadRemoteXPCModule as sinon.SinonStub).calledOnce).to.be.true;
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

    expect(await access.determineAvailability()).to.equal(true);
    expect(await access.attemptService('test feature', operation)).to.equal(null);
    expect(await access.determineAvailability()).to.equal(true);
    expect(warn.calledOnce).to.be.true;
    expect(operation.calledOnce).to.be.true;
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
      expect.fail('expected requireService to throw');
    } catch (err: any) {
      expect(err.message).to.include('test feature');
    }
  });
});
