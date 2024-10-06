const {WebDriverAgent} = require('appium-webdriveragent');
const xcode = require('appium-xcode');
const {Simctl} = require('node-simctl');
const {getSimulator} = require('appium-ios-simulator');
const {logger} = require('appium/support');

const log = logger.getLogger('WDA');

function parseArgValue(argName) {
  const argNamePattern = new RegExp(`^--${argName}\\b`);
  for (let i = 1; i < process.argv.length; ++i) {
    const arg = process.argv[i];
    if (argNamePattern.test(arg)) {
      return arg.includes('=') ? arg.split('=')[1] : process.argv[i + 1];
    }
  }
  return null;
}

async function build() {
  const customDevice = parseArgValue('name');
  const xcodeVersion = await xcode.getVersion(true);
  const platformVersion = parseArgValue('sdk') || (await xcode.getMaxIOSSDK());
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
