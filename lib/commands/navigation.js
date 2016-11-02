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
    let backButton = _.filter(buttons, (value) => value.label === 'Back')[0];
    log.debug(`Found navigation bar 'back' button. Clicking.`);
    await this.nativeClick(backButton);
  } catch (err) {
    log.error('Unable to find navigation bar and back button.');
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
