import { WebDriverAgent } from 'appium-webdriveragent';
import { translateDeviceName, getAndCheckXcodeVersion, getAndCheckIosSdkVersion } from './utils';
import { getExistingSim } from './simulator-management';
import { asyncify } from 'asyncbox';

const DEFAULT_SIM_NAME = 'iPhone 12';

// TODO: allow passing in all the various build params as CLI args
async function build () {
  const xcodeVersion = await getAndCheckXcodeVersion();
  const iosVersion = await getAndCheckIosSdkVersion();
  const deviceName = translateDeviceName(iosVersion, DEFAULT_SIM_NAME);
  const device = await getExistingSim({
    platformVersion: iosVersion,
    deviceName
  });
  const wda = new WebDriverAgent(xcodeVersion, {
    iosSdkVersion: iosVersion,
    platformVersion: iosVersion,
    showXcodeLog: true,
    device,
  });
  await wda.xcodebuild.start(true);
}

if (require.main === module) {
  asyncify(build);
}

export default build;
