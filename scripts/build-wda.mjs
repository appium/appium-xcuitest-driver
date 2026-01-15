import {WebDriverAgent} from 'appium-webdriveragent';
import * as xcode from 'appium-xcode';
import {Simctl} from 'node-simctl';
import {getSimulator} from 'appium-ios-simulator';
import {logger} from 'appium/support.js';
import {parseArgValue} from './utils.js';

const log = logger.getLogger('WDA');

async function build() {
  const customDevice = parseArgValue('name');
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

(async () => await build())();
