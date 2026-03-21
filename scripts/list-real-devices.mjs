#!/usr/bin/env node
/**
 * Lists real devices via **usbmuxd** by default, or via **`xcrun devicectl`** when `--devicectl` is set.
 * Uses `appium-ios-remotexpc` (`createUsbmux` → `listDevices`) and `node-devicectl` respectively.
 *
 * Run (from the driver package):
 *
 *   appium driver run xcuitest list-real-devices
 *   appium driver run xcuitest list-real-devices -- --devicectl
 *   appium driver run xcuitest list-real-devices -- --connection wired
 *
 * Wireless Apple TV is not listed by usbmux by default; use `--devicectl` to list Core Device entries
 * (including tvOS / Apple TV over the network).
 *
 * JSON shape: `{ source, filters: { connection }, devices }` where `devices` is an array of
 * `{ udid, entries }` — multiple usbmux rows (e.g. USB + Network) for the same iPhone/iPad are grouped.
 *
 * devicectl (`xcrun devicectl list devices` JSON) uses `connectionProperties.transportType`, for example
 * `wired` / `usb` for USB, and `localNetwork` for Wi‑Fi/LAN (Core Device).
 */

import {createUsbmux} from 'appium-ios-remotexpc';
import {Devicectl} from 'node-devicectl';
import {logger, util} from 'appium/support.js';
import {Command, Option} from 'commander';

const log = logger.getLogger('Lister');

class RealDevicesLister {
  /**
   * @param {{
   *   devicectl?: boolean,
   *   connection?: ConnectionFilter,
   * }} opts
   */
  async run(opts) {
    const source = opts.devicectl ? 'devicectl' : 'usbmux';
    const connection = /** @type {ConnectionFilter} */ (opts.connection ?? 'all');

    /** @type {UsbmuxDevice[] | DeviceInfo[]} */
    let devices;
    if (source === 'usbmux') {
      devices = await this._listFilteredUsbmux(connection);
    } else {
      devices = await this._listFilteredDevicectl(connection);
    }

    const grouped = this._groupDevicesByUdid(devices, source);

    const payload = {
      source,
      filters: {connection},
      devices: grouped,
    };

    log.info(
      `${util.pluralize('unique device', grouped.length, true)} ` +
        `(${util.pluralize('entry', devices.length, true)} via ${source}, connection=${connection}).`,
    );
    log.info(this._safeJsonStringify(payload));
  }

  /**
   * @param {UsbmuxDevice[] | DeviceInfo[]} devices
   * @param {'usbmux' | 'devicectl'} source
   * @returns {{ udid: string, entries: Array<UsbmuxDevice | DeviceInfo>}[]}
   * @private
   */
  _groupDevicesByUdid(devices, source) {
    /** @type {Map<string, Array<UsbmuxDevice | DeviceInfo>>} */
    const map = new Map();
    for (const d of devices) {
      const udid = source === 'usbmux' ? this._getUsbmuxUdid(/** @type {UsbmuxDevice} */ (d)) : this._getDevicectlUdid(/** @type {DeviceInfo} */ (d));
      const key = udid ?? 'unknown';
      let bucket = map.get(key);
      if (!bucket) {
        bucket = [];
        map.set(key, bucket);
      }
      bucket.push(d);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([udid, entries]) => ({udid, entries}));
  }

  /**
   * @param {UsbmuxDevice} device
   * @returns {string | undefined}
   * @private
   */
  _getUsbmuxUdid(device) {
    const sn = device.Properties?.SerialNumber;
    if (typeof sn === 'string' && sn.length > 0) {
      return sn;
    }
    const top = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (device));
    const topSn = top.SerialNumber;
    if (typeof topSn === 'string' && topSn.length > 0) {
      return topSn;
    }
    return undefined;
  }

  /**
   * @param {DeviceInfo} device
   * @returns {string | undefined}
   * @private
   */
  _getDevicectlUdid(device) {
    const u = device.hardwareProperties?.udid;
    if (typeof u === 'string' && u.length > 0) {
      return u;
    }
    if (typeof device.identifier === 'string' && device.identifier.length > 0) {
      return device.identifier;
    }
    return undefined;
  }

  /**
   * @param {ConnectionFilter} connection
   * @returns {Promise<UsbmuxDevice[]>}
   * @private
   */
  async _listFilteredUsbmux(connection) {
    log.info('Connecting to usbmuxd...');
    const usbmux = await createUsbmux();
    let raw;
    try {
      raw = await usbmux.listDevices();
    } finally {
      await usbmux.close();
    }

    if (raw.length === 0) {
      log.info(
        'No devices reported by usbmuxd. Connect an unlocked device with a data-capable USB cable, ' +
          'accept the Trust prompt, and trust the host. Wireless iOS entries require prior USB pairing.',
      );
      return [];
    }

    const filtered = raw.filter((d) => this._matchesUsbmuxConnection(d, connection));

    if (filtered.length === 0 && raw.length > 0) {
      log.info(
        `No devices match connection=${connection}; usbmuxd reported ` +
          `${util.pluralize('device', raw.length, true)} in total.`,
      );
    }
    return filtered;
  }

  /**
   * @param {ConnectionFilter} connection
   * @returns {Promise<DeviceInfo[]>}
   * @private
   */
  async _listFilteredDevicectl(connection) {
    log.info('Listing devices via xcrun devicectl...');
    let raw;
    try {
      raw = await new Devicectl('').listDevices();
    } catch (err) {
      log.error(
        `devicectl failed: ${err instanceof Error ? err.message : String(err)}. ` +
          'Requires Xcode 15+ and `xcrun devicectl list devices`.',
      );
      return [];
    }

    if (raw.length === 0) {
      log.info('No devices reported by devicectl. Pair devices in Xcode / Wireless and ensure Core Device is available.');
      return [];
    }

    const filtered = raw.filter((d) => this._matchesDevicectlConnection(d, connection));

    if (filtered.length === 0 && raw.length > 0) {
      log.info(
        `No devices match connection=${connection}; devicectl reported ` +
          `${util.pluralize('device', raw.length, true)} in total.`,
      );
    }
    return filtered;
  }

  /**
   * @param {UsbmuxDevice} device
   * @param {ConnectionFilter} connection
   * @returns {boolean}
   * @private
   */
  _matchesUsbmuxConnection(device, connection) {
    if (connection === 'all') {
      return true;
    }
    const ct = device.Properties.ConnectionType;
    const wired = this._isUsbMuxWired(ct);
    if (connection === 'wired') {
      return wired;
    }
    if (connection === 'wireless') {
      return !wired && this._isUsbMuxWireless(ct);
    }
    return true;
  }

  /**
   * @param {string} ct
   * @returns {boolean}
   * @private
   */
  _isUsbMuxWired(ct) {
    return typeof ct === 'string' && /^usb$/i.test(ct.trim());
  }

  /**
   * @param {string} ct
   * @returns {boolean}
   * @private
   */
  _isUsbMuxWireless(ct) {
    if (typeof ct !== 'string') {
      return false;
    }
    const t = ct.trim();
    return /^network$/i.test(t) || /^wifi$/i.test(t) || /wi-?fi/i.test(t);
  }

  /**
   * @param {DeviceInfo} device
   * @param {ConnectionFilter} connection
   * @returns {boolean}
   * @private
   */
  _matchesDevicectlConnection(device, connection) {
    if (connection === 'all') {
      return true;
    }
    if (connection === 'wired') {
      return this._isDevicectlWired(device);
    }
    if (connection === 'wireless') {
      return this._isDevicectlWireless(device);
    }
    return true;
  }

  /**
   * USB / cable: `connectionProperties.transportType` is `wired` or `usb` in devicectl JSON.
   * @param {DeviceInfo} device
   * @returns {boolean}
   * @private
   */
  _isDevicectlWired(device) {
    const t = device.connectionProperties?.transportType?.toLowerCase();
    return t === 'wired' || t === 'usb';
  }

  /**
   * Any Core Device transport that is not USB cable: e.g. `transportType` `localNetwork` (Wi‑Fi/LAN),
   * or other non-`wired`/`usb` values from `xcrun devicectl list devices` JSON.
   * @param {DeviceInfo} device
   * @returns {boolean}
   * @private
   */
  _isDevicectlWireless(device) {
    return !this._isDevicectlWired(device);
  }

  /**
   * @param {unknown} value
   * @returns {string}
   * @private
   */
  _safeJsonStringify(value) {
    return JSON.stringify(value, (_key, v) => this._jsonReplacer(_key, v), 2);
  }

  /**
   * Replaces Buffers (e.g. usbmux `NetworkAddress`) with `{ type: 'Buffer', byteLength }` in JSON output.
   * @param {string} key
   * @param {unknown} value
   * @returns {unknown}
   * @private
   */
  _jsonReplacer(key, value) {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (Buffer.isBuffer(value)) {
      return this._formatBufferForJson(key, value);
    }
    if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
      return this._formatBufferForJson(key, Buffer.from(value));
    }
    // `JSON.stringify` invokes Buffer#toJSON first, so we see `{ type: 'Buffer', data: [...] }` here.
    const asRecord = /** @type {Record<string, unknown>} */ (value);
    if (
      value !== null &&
      typeof value === 'object' &&
      asRecord.type === 'Buffer' &&
      Array.isArray(asRecord.data)
    ) {
      return this._formatBufferForJson(key, Buffer.from(/** @type {number[]} */ (asRecord.data)));
    }
    return value;
  }

  /**
   * @param {string} _key
   * @param {Buffer} buf
   * @returns {{ type: 'Buffer', byteLength: number }}
   * @private
   */
  _formatBufferForJson(_key, buf) {
    return {type: 'Buffer', byteLength: buf.length};
  }
}

async function main() {
  const lister = new RealDevicesLister();
  const program = new Command();
  program
    .name('appium driver run xcuitest list-real-devices')
    .description(
      'List real devices via usbmuxd by default, or via xcrun devicectl with --devicectl. ' +
        'Wireless Apple TV is not available from usbmux; use --devicectl for Core Device (includes tvOS).',
    )
    .option('--devicectl', 'list devices via xcrun devicectl (Core Device) instead of usbmuxd')
    .addOption(
      new Option(
        '--connection <type>',
        'filter by connection (usbmux: USB vs Network; devicectl: wired/usb vs wireless e.g. localNetwork)',
      )
        .choices(['all', 'wired', 'wireless'])
        .default('all'),
    )
    .action(async (options) => {
      await lister.run(options);
    });

  await program.parseAsync(process.argv);
}

await main();

/**
 * @typedef {import('appium-ios-remotexpc').UsbmuxDevice} UsbmuxDevice
 * @typedef {import('node-devicectl').DeviceInfo} DeviceInfo
 * @typedef {'all' | 'wired' | 'wireless'} ConnectionFilter
 */
