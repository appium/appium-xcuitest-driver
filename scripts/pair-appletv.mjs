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
 *   appium driver run xcuitest pair-appletv -- [options]
 *
 * Options:
 *   -d, --device <selector>   Device selector:
 *                             - Device name (e.g. "Living Room")
 *                             - Device identifier (e.g. "AA:BB:CC:DD:EE:FF")
 *                             - Device index (e.g. "0", "1", "2")
 */

import {logger} from 'appium/support.js';
import {Command} from 'commander';
import {AppleTVPairingService, UserInputService} from 'appium-ios-remotexpc';

const log = logger.getLogger('AppleTVPairing');

async function main() {
  const program = new Command();
  program
    .name('appium driver run xcuitest pair-appletv')
    .description('Pair Apple TV / tvOS devices over WiFi for Remote XPC tunnels')
    .option(
      '-d, --device <selector>',
      'Apple TV device selector (name, identifier, or index)',
    );

  program.parse(process.argv);
  const options = program.opts();

  const userInput = new UserInputService();
  const pairingService = new AppleTVPairingService(userInput);

  const result = await pairingService.discoverAndPair(options.device);

  if (!result.success) {
    throw result.error ?? new Error('Pairing failed');
  }

  log.info(
    'Pairing successful. ' +
    `Use this identifier as the udid for WiFi tvOS tunnels: ${result.deviceId}`,
  );
}


await main();
