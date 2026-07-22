import type {Simulator} from 'appium-ios-simulator';

import {
  createSim as createSimulator,
  setLocalizationPrefs,
  setSafariPrefs,
  shutdownOtherSimulators,
} from '../device/simulator-management.js';
import type {XCUITestDriver} from '../driver.js';
import {upperFirst} from '../utils/index.js';

const SHUTDOWN_OTHER_FEAT_NAME = 'shutdown_other_sims';

/**
 * Boots and configures the selected Simulator for the current session.
 */
export async function initSimulator(this: XCUITestDriver): Promise<void> {
  const device = this.device as Simulator;

  if (this.opts.shutdownOtherSimulators) {
    this.assertFeatureEnabled(SHUTDOWN_OTHER_FEAT_NAME);
    await shutdownOtherSimulators.bind(this)();
  }

  await this.startSim();

  if (this.opts.customSSLCert) {
    // Simulator must be booted in order to call this helper
    await device.addCertificate(this.opts.customSSLCert);
    this.logEvent('customCertInstalled');
  }

  if (await setSafariPrefs.bind(this)()) {
    this.log.debug('Safari preferences have been updated');
  }

  if (await setLocalizationPrefs.bind(this)()) {
    this.log.debug('Localization preferences have been updated');
  }

  const promises: Promise<any>[] = ['reduceMotion', 'reduceTransparency', 'autoFillPasswords']
    .filter((optName) => typeof (this.opts as Record<string, any>)[optName] === 'boolean')
    .map((optName) => {
      this.log.info(`Setting ${optName} to ${(this.opts as Record<string, any>)[optName]}`);
      // @ts-expect-error no types
      return device[`set${upperFirst(optName)}`]((this.opts as Record<string, any>)[optName]);
    });
  await Promise.all(promises);

  this.logEvent('simStarted');
}

/**
 * Starts the selected Simulator with the configured startup options.
 */
export async function startSim(this: XCUITestDriver): Promise<void> {
  const devicePreferences: any = {};
  const runOpts: any = {
    scaleFactor: this.opts.scaleFactor,
    connectHardwareKeyboard: !!this.opts.connectHardwareKeyboard,
    pasteboardAutomaticSync: this.opts.simulatorPasteboardAutomaticSync ?? 'off',
    isHeadless: !!this.opts.isHeadless,
    tracePointer: this.opts.simulatorTracePointer,
    devicePreferences,
  };

  // add the window center, if it is specified
  if (this.opts.simulatorWindowCenter) {
    devicePreferences.SimulatorWindowCenter = this.opts.simulatorWindowCenter;
  }

  if (Number.isInteger(this.opts.simulatorStartupTimeout)) {
    runOpts.startupTimeout = this.opts.simulatorStartupTimeout;
  }

  // This is to workaround XCTest bug about changing Simulator
  // orientation is not synchronized to the actual window orientation
  const orientation = typeof this.opts.orientation === 'string' && (this.opts.orientation as string).toUpperCase();
  switch (orientation) {
    case 'LANDSCAPE':
      devicePreferences.SimulatorWindowOrientation = 'LandscapeLeft';
      devicePreferences.SimulatorWindowRotationAngle = 90;
      break;
    case 'PORTRAIT':
      devicePreferences.SimulatorWindowOrientation = 'Portrait';
      devicePreferences.SimulatorWindowRotationAngle = 0;
      break;
  }

  await (this.device as Simulator).run(runOpts);
}

/**
 * Creates a new Simulator matching the current session capabilities.
 *
 * @deprecated This command is deprecated and will be removed in a future version.
 */
export async function createSim(this: XCUITestDriver): Promise<Simulator> {
  this.lifecycleData.createSim = true;
  // create sim for caps
  const sim = await createSimulator.bind(this)();
  this.log.info(`Created simulator with udid '${sim.udid}'.`);
  return sim;
}
