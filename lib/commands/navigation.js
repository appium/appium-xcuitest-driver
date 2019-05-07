import { errors } from 'appium-base-driver';
import { util } from 'appium-support';
import _ from 'lodash';
import log from '../logger';


let commands = {}, helpers = {}, extensions = {};

commands.back = async function back () {
  if (!this.isWebContext()) {
    await this.nativeBack();
  } else {
    await this.mobileWebNav('back');
  }
};

helpers.nativeBack = async function nativeBack () {
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

commands.forward = async function forward () {
  if (!this.isWebContext()) {
  }
  await this.mobileWebNav('forward');
};

commands.closeWindow = async function closeWindow () {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }
  let script = "return window.open('','_self').close();";
  if (util.compareVersions(this.opts.platformVersion, '>=', '12.2')) {
    // on 12.2 the whole message is evaluated in the context of the page,
    // which is closed and so never returns
    script = `setTimeout(function () {window.open('','_self').close();}, 0); return true;`;
  }
  return await this.executeAtom('execute_script', [script, []], true);
};


Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
