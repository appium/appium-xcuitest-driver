import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {isDeviceListedInUsbmux} from '../../../lib/device/remote-xpc/usbmux-utils.js';

function fakeRemotexpc(serialNumbers: string[]) {
  return {
    createUsbmux: async () => ({
      listDevices: async () => serialNumbers.map((SerialNumber) => ({Properties: {SerialNumber}})),
      close: async () => {},
    }),
  } as any;
}

describe('isDeviceListedInUsbmux', function () {
  it('matches a usbmux-reported serial number that differs only by letter case', async function () {
    const remotexpc = fakeRemotexpc(['9A7D25307EE8ABD1A0B3C4D5E6F70819AABBCCDD']);
    const isListed = await isDeviceListedInUsbmux(remotexpc, '9a7d25307ee8abd1a0b3c4d5e6f70819aabbccdd');
    assert.strictEqual(isListed, true);
  });

  it('returns false when no device matches', async function () {
    const remotexpc = fakeRemotexpc(['9A7D25307EE8ABD1A0B3C4D5E6F70819AABBCCDD']);
    const isListed = await isDeviceListedInUsbmux(remotexpc, 'deadbeef');
    assert.strictEqual(isListed, false);
  });

  it('returns false and does not throw when usbmux is unavailable', async function () {
    const remotexpc = {
      createUsbmux: async () => {
        throw new Error('usbmux unavailable');
      },
    } as any;
    const isListed = await isDeviceListedInUsbmux(remotexpc, 'anything');
    assert.strictEqual(isListed, false);
  });
});
