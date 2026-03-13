import {WebDriverAgent} from 'appium-webdriveragent';
import * as xcode from 'appium-xcode';
import {Simctl} from 'node-simctl';
import {getSimulator} from 'appium-ios-simulator';
import {logger} from 'appium/support.js';
import {Command} from 'commander';

const log = logger.getLogger('WDA');

/**
 * @param {BuildOptions} [options]
 */
async function build(options) {
  const customDevice = options?.name ?? null;
  const platformVersion = options?.sdk || (await xcode.getMaxIOSSDK());

  if (!platformVersion) {
    throw new Error(
      'Cannot determine iOS SDK version to build for. Please specify --sdk=<version> or ensure Xcode and its command-line tools are installed (try `xcodebuild -showsdks` or `xcode-select --print-path`).'
    );
  }

  const iosDevices = await new Simctl().getDevices(platformVersion, 'iOS');
  const verifyDevicePresence = (info) => {
    if (!info) {
      throw new Error(
        `Cannot find any available iOS ${platformVersion} ${customDevice ? `${customDevice} ` : ''}simulator on your system. Only the following simulators are available:\n${iosDevices.map((e) => e.name).join('\n')}`,
      );
    }
    return info;
  };
  const deviceInfo = verifyDevicePresence(
    iosDevices.find(({name}) => name.includes(customDevice || 'iPhone')),
  );
  const device = await getSimulator(deviceInfo.udid, {
    platform: deviceInfo.platform,
    checkExistence: false,
  });
  const wda = new WebDriverAgent({
    iosSdkVersion: platformVersion,
    platformVersion,
    showXcodeLog: true,
    device,
  });
  log.info(
    `Building WDA for ${deviceInfo.name} ${platformVersion} with udid '${deviceInfo.udid}' Simulator...`,
  );
  await wda.xcodebuild.start(true);
}

async function main() {
  const program = new Command();

  program
    .name('appium driver run xcuitest build-wda')
    .description('Build WebDriverAgent for a target iOS simulator')
    .option('--name <deviceName>', 'Simulator name to build for (defaults to iPhone*)')
    .option('--sdk <sdkVersion>', 'iOS SDK / platform version (e.g. 17.2)')
    .addHelpText(
      'after',
      `
EXAMPLES:
  # Build WDA for default simulator
  appium driver run xcuitest build-wda

  # Build WDA for specific simulator and SDK
  appium driver run xcuitest build-wda --name "iPhone 15" --sdk 17.2`,
    )
    .action(async (options) => {
      await build(options);
    });

  await program.parseAsync(process.argv);
}

await main();

/**
 * @typedef {Object} BuildOptions
 * @property {string | undefined} [name]
 * @property {string | undefined} [sdk]
 */
