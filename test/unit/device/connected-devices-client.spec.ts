import assert from 'node:assert/strict';
import {afterEach, describe, it, mock} from 'node:test';

import sinon from 'sinon';

import * as moduleLoaderModule from '../../../lib/device/remote-xpc/module-loader.js';

let currentModule: any = null;
let devicectlDevices: string[] = [];

mock.module('../../../lib/device/remote-xpc/module-loader.js', {
  namedExports: {
    ...moduleLoaderModule,
    loadRemoteXPCModule: async () => {
      if (!currentModule) {
        throw new Error('Cannot find package');
      }
      return currentModule;
    },
  },
});

mock.module('node-devicectl', {
  namedExports: {
    Devicectl: class {
      async listDevices() {
        return devicectlDevices.map((udid) => ({hardwareProperties: {udid}}));
      }
    },
  },
});

const {ConnectedDevicesClient} = await import('../../../lib/device/connected-devices-client.js');

function makeModule({registry, usbmux}: {registry: string[] | Error; usbmux: string[] | Error}) {
  const close = sinon.stub().resolves();
  return {
    close,
    module: {
      Services: {
        getAvailableDevices:
          registry instanceof Error ? sinon.stub().rejects(registry) : sinon.stub().resolves(registry),
      },
      createUsbmux:
        usbmux instanceof Error
          ? sinon.stub().rejects(usbmux)
          : sinon.stub().resolves({
              listDevices: async () => usbmux.map((SerialNumber) => ({Properties: {SerialNumber}})),
              close,
            }),
    },
  };
}

describe('ConnectedDevicesClient', function () {
  afterEach(function () {
    currentModule = null;
    delete process.env.APPIUM_XCUITEST_PREFER_DEVICECTL;
  });

  it('lists usbmux devices without a tunnel registry, de-duplicating the USB and network entries', async function () {
    const {module, close} = makeModule({registry: new Error('registry down'), usbmux: ['A', 'B', 'A']});
    currentModule = module;

    const client = await ConnectedDevicesClient.create();

    assert.deepStrictEqual(await client.getConnectedDevices(), ['A', 'B']);
    assert.strictEqual(close.calledOnce, true);
  });

  it('puts usbmux-only devices first and registry devices last, ignoring case in the de-duplication', async function () {
    const {module} = makeModule({registry: ['W', 'a'], usbmux: ['A', 'U']});
    currentModule = module;

    const client = await ConnectedDevicesClient.create();

    assert.deepStrictEqual(await client.getConnectedDevices(), ['U', 'W', 'a']);
  });

  it('lists devicectl devices instead of usbmux ones when preferred', async function () {
    process.env.APPIUM_XCUITEST_PREFER_DEVICECTL = 'true';
    devicectlDevices = ['D1', 'D2'];
    const {module} = makeModule({registry: new Error('registry down'), usbmux: ['A']});
    currentModule = module;

    const client = await ConnectedDevicesClient.create();

    assert.deepStrictEqual(await client.getConnectedDevices(), ['D1', 'D2']);
    assert.strictEqual(module.createUsbmux.called, false);
  });

  it('returns the registry devices when usbmuxd is unreachable', async function () {
    const {module} = makeModule({registry: ['W'], usbmux: new Error('The usbmuxd socket does not exist')});
    currentModule = module;

    const client = await ConnectedDevicesClient.create();

    assert.deepStrictEqual(await client.getConnectedDevices(), ['W']);
  });

  it('returns an empty list instead of throwing when nothing is reachable', async function () {
    const {module} = makeModule({registry: new Error('registry down'), usbmux: new Error('no usbmuxd')});
    currentModule = module;

    const client = await ConnectedDevicesClient.create();

    assert.deepStrictEqual(await client.getConnectedDevices(), []);
  });

  it('returns an empty list when the remotexpc module cannot be loaded', async function () {
    currentModule = null;

    const client = await ConnectedDevicesClient.create();

    assert.deepStrictEqual(await client.getConnectedDevices(), []);
  });
});
