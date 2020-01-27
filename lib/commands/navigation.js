import { errors } from 'appium-base-driver';
import _ from 'lodash';
import log from '../logger';
import { waitForCondition } from 'asyncbox';

let commands = {}, helpers = {}, extensions = {};

// these two constitute the wait after closing a window
const CLOSE_WINDOW_TIMEOUT = 5000;
const CLOSE_WINDOW_INTERVAL = 100;

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

  // since the window will be closed and the execution context gone, return
  // first before closing. Waiting for close will happen in the finally block
  const script = `setTimeout(function () {window.open('','_self').close();}, 0); return true;`;
  const context = this.curContext;
  try {
    return await this.executeAtom('execute_script', [script, []], true);
  } finally {
    // wait for the window to successfully change...
    try {
      await waitForCondition(() => this.curContext !== context, {
        waitMs: CLOSE_WINDOW_TIMEOUT,
        intervalMs: CLOSE_WINDOW_INTERVAL,
      });
    } catch (ign) {
      log.debug('Context has not yet been changed after closing window. Continuing...');
    }
  }
};


Object.assign(extensions, commands, helpers);
export { commands, helpers };
export default extensions;
