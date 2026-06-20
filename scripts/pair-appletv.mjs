#!/usr/bin/env node
/**
 * Pair Apple TV / tvOS devices over WiFi for Remote XPC tunnels.
 *
 * This script wraps the Apple TV pairing support provided by the optional
 * `appium-ios-remotexpc` dependency. It discovers Apple TV devices on the
 * local network, lets you select one (or target it via a selector), and runs
 * the pairing flow so that subsequent WiFi tunnels can be established.
 *
 * Usage (from Appium CLI):
 *
 *   sudo appium driver run xcuitest pair-appletv -- [options]
 *
 * Options:
 *   -d, --device <selector>   Device selector:
 *                             - Device name (e.g. "Living Room")
 *                             - Device identifier (e.g. "AA:BB:CC:DD:EE:FF")
 *                             - Device index (e.g. "0", "1", "2")
 *   --discovery-timeout-ms <ms>
 *                             Apple TV pairing discovery timeout in milliseconds
 */

import {logger} from 'appium/support.js';
import {Command} from 'commander';
import {AppleTVPairingService, UserInputService} from 'appium-ios-remotexpc';

import {parsePositiveIntegerOption} from './lib/options.mjs';
import {startTimeoutProgressLogger} from './lib/progress.mjs';
import {assertRoot} from './lib/root.mjs';

const log = logger.getLogger('AppleTVPairing');
const APPLETV_PAIRING_DISCOVERY_PROGRESS_INTERVAL_MS = 1000;
const DEFAULT_APPLETV_PAIRING_DISCOVERY_TIMEOUT_MS =
  Number(process.env.APPLETV_DISCOVERY_TIMEOUT) || 10_000;
const APPLETV_PAIRING_DISCOVERY_PROGRESS_BAR_WIDTH = 24;

async function main() {
  assertRoot('pair-appletv');
  const program = new Command();
  program
    .name('appium driver run xcuitest pair-appletv')
    .description('Pair Apple TV / tvOS devices over WiFi for Remote XPC tunnels')
    .option(
      '-d, --device <selector>',
      'Apple TV device selector (name, identifier, or index)',
    )
    .option(
      '--discovery-timeout-ms <ms>',
      'Apple TV pairing discovery timeout in milliseconds',
      (value) => parsePositiveIntegerOption(value, 'discovery timeout'),
      DEFAULT_APPLETV_PAIRING_DISCOVERY_TIMEOUT_MS,
    );

  program.parse(process.argv);
  const options = program.opts();

  const userInput = new UserInputService();
  const pairingService = new AppleTVPairingService(userInput);

  const devices = await discoverAppleTVPairingDevices(
    pairingService,
    options.discoveryTimeoutMs,
  );
  if (devices.length === 0) {
    log.info(getNoAppleTVPairingDevicesMessage());
    return;
  }

  const result = await pairingService.discoverAndPair(options.device, {
    devices,
    discoveryTimeoutMs: options.discoveryTimeoutMs,
  });

  if (!result.success) {
    if (isNoAppleTVPairingDevicesFoundError(result.error)) {
      log.info(getNoAppleTVPairingDevicesMessage());
      return;
    }
    throw result.error ?? new Error('Pairing failed');
  }

  log.info(
    'Pairing successful. ' +
    `Use this identifier as the udid for WiFi tvOS tunnels: ${result.deviceId}`,
  );
}

/**
 * @param {import('appium-ios-remotexpc').AppleTVPairingService} pairingService
 * @param {number} discoveryTimeoutMs
 * @returns {Promise<AppleTVDevice[]>}
 */
async function discoverAppleTVPairingDevices(pairingService, discoveryTimeoutMs) {
  const startedAt = performance.now();
  const pairingDiscoveryProgress = startTimeoutProgressLogger({
    log,
    label: 'Waiting for Apple TV pairing discovery',
    startedAt,
    timeoutMs: discoveryTimeoutMs,
    barWidth: APPLETV_PAIRING_DISCOVERY_PROGRESS_BAR_WIDTH,
    intervalMs: APPLETV_PAIRING_DISCOVERY_PROGRESS_INTERVAL_MS,
  });

  try {
    const devices = await pairingService.discoverDevices({
      timeoutMs: discoveryTimeoutMs,
    });
    pairingDiscoveryProgress.succeed(
      `Apple TV pairing discovery completed: ${devices.length} device(s) found`,
    );
    return devices;
  } catch (err) {
    pairingDiscoveryProgress.fail('Apple TV pairing discovery failed');
    throw err;
  }
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isNoAppleTVPairingDevicesFoundError(err) {
  return (
    err instanceof Error &&
    (err.message === getNoAppleTVPairingDevicesMessage() ||
      ('code' in err && err.code === 'NO_DEVICES'))
  );
}

/**
 * @returns {string}
 */
function getNoAppleTVPairingDevicesMessage() {
  return 'No Apple TV pairing devices found. Please ensure your Apple TV is on the same network and in pairing mode.';
}

await main();

/**
 * @typedef {import('appium-ios-remotexpc').AppleTVDevice} AppleTVDevice
 */
