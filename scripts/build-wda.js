const {WebDriverAgent} = require('appium-webdriveragent');
const xcode = require('appium-xcode');
const B = require('bluebird');
const {Simctl} = require('node-simctl');
const {getSimulator} = require('appium-ios-simulator');
const log = require('fancy-log');

// TODO: allow passing in all the various build params as CLI args
async function build() {
  const [xcodeVersion, platformVersion] = await B.all([
    xcode.getVersion(true),
    xcode.getMaxIOSSDK(),
  ]);
  const verifyDevicePresence = (info) => {
    if (!info) {
      throw new Error(`Cannot find any available iOS ${platformVersion} Simulator on your system`);
    }
    return info;
  };
  const deviceInfo = verifyDevicePresence(
    (await new Simctl().getDevices(platformVersion, 'iOS')).find(({name}) =>
      name.includes('iPhone'),
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
  log.info(`Building WDA for ${deviceInfo.name} ${platformVersion} Simulator...`);
  await wda.xcodebuild.start(true);
}

(async () => await build())();
