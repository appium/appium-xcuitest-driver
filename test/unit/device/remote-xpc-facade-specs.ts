import {expect} from 'chai';
import sinon from 'sinon';

import {RemoteXPCFacade} from '../../../lib/device/remote-xpc';
import * as moduleLoader from '../../../lib/device/remote-xpc/module-loader';
import * as usbmuxUtils from '../../../lib/device/remote-xpc/usbmux-utils';

describe('RemoteXPCFacade', function () {
  afterEach(function () {
    sinon.restore();
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

    sinon.stub(moduleLoader, 'tryLoadRemoteXPCModule').resolves({
      Services: {
        getTunnelForDevice: sinon.stub().rejects(tunnelErr),
      },
    } as any);
    sinon.stub(usbmuxUtils, 'isDeviceListedInUsbmux').resolves(false);

    const warn = sinon.stub();
    const access = new RemoteXPCFacade('udid-1', '18.0', {debug: sinon.stub(), warn, info: sinon.stub()} as any, true);

    expect(await access.determineAvailability()).to.equal(false);
    expect(await access.determineAvailability()).to.equal(false);
    expect(warn.calledOnce).to.be.true;
    expect((moduleLoader.tryLoadRemoteXPCModule as sinon.SinonStub).calledOnce).to.be.true;
  });

  it('does not disable remotexpc when a later service call hits a tunnel error', async function () {
    const tunnelErr = new Error('No tunnel found for device udid-1');
    tunnelErr.name = 'TunnelAvailabilityError';
    const operation = sinon.stub().rejects(tunnelErr);
    const services = {operation};

    sinon.stub(moduleLoader, 'tryLoadRemoteXPCModule').resolves({
      Services: {
        getTunnelForDevice: sinon.stub().resolves({}),
        ...services,
      },
    } as any);
    sinon.stub(usbmuxUtils, 'isDeviceListedInUsbmux').resolves(false);

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

    sinon.stub(moduleLoader, 'tryLoadRemoteXPCModule').resolves({
      Services: {
        getTunnelForDevice: sinon.stub().rejects(tunnelErr),
      },
    } as any);
    sinon.stub(usbmuxUtils, 'isDeviceListedInUsbmux').resolves(false);

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
