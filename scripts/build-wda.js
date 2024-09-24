const {WebDriverAgent} = require('appium-webdriveragent');
const xcode = require('appium-xcode');
const B = require('bluebird');
const {Simctl} = require('node-simctl');
const {getSimulator} = require('appium-ios-simulator');
const {logger} = require('appium/support');
const yargs = require('yargs/yargs');
const {hideBin} = require('yargs/helpers');

const log = logger.getLogger('WDA');

const argv = yargs(hideBin(process.argv)).options({
  sdk: {type: 'string', alias: 'v', demandOption: false, describe: 'iOS SDK version to use'},
  name: {
    type: 'string',
    alias: 'd',
    demandOption: false,
    describe: 'Name of the iOS simulator to use',
  },
}).argv;

async function build() {
  let [xcodeVersion, platformVersion] = await B.all([xcode.getVersion(true), xcode.getMaxIOSSDK()]);
  platformVersion = argv.sdk || platformVersion;

  const verifyDevicePresence = (info) => {
    if (!info) {
      throw new Error(
        `Cannot find any available iOS ${platformVersion} ${argv.name || ''} Simulator on your system`,
      );
    }
    return info;
  };
  const deviceInfo = verifyDevicePresence(
    (await new Simctl().getDevices(platformVersion, 'iOS')).find(({name}) =>
      name.includes(argv.name || 'iPhone'),
    ),
  );
  const device = await getSimulator(deviceInfo.udid, {
    platform: deviceInfo.platform,
    checkExistence: false,
  });
  const wda = new WebDriverAgent(xcodeVersion, {
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

(async () => await build())();
