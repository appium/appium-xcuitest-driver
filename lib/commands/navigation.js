import { errors } from 'appium-base-driver';
import _ from 'lodash';
import log from '../logger';


let commands = {}, helpers = {}, extensions = {};

commands.back = async function () {
  if (!this.isWebContext()) {
    await this.nativeBack();
  } else {
    await this.mobileWebNav('back');
  }
};

helpers.nativeBack = async function () {
  try {
    let navBar = await this.findNativeElementOrElements('class name', 'XCUIElementTypeNavigationBar', false);
    let buttons = await this.findNativeElementOrElements('class name', 'XCUIElementTypeButton', true, navBar);
    if (buttons.length === 0) {
      throw new Error('No buttons found in navigation bar');
    }

    let backButton = _.filter(buttons, (value) => value.label === 'Back')[0];
    if (backButton) {
      log.debug(`Found navigation bar 'back' button. Clicking.`);
    } else {
      log.debug(`Unable to find 'Back' button. Trying first button in navigation bar`);
      backButton = buttons[0];
    }
    await this.nativeClick(backButton);
  } catch (err) {
    log.error(`Unable to find navigation bar and back button: ${err.message}`);
  }
};

commands.forward = async function () {
  if (!this.isWebContext()) {
  }
  await this.mobileWebNav('forward');
};

commands.closeWindow = async function () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }
  let script = "return window.open('','_self').close();";
  return await this.executeAtom('execute_script', [script, []], true);
};


Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
