import { iosCommands } from 'appium-ios-driver';


let extensions = {};

Object.assign(extensions, iosCommands.context);

// override, as appium-ios-driver's version uses UI Automation to close
extensions.closeAlertBeforeTest = async function () {
  return;
};

export default extensions;
