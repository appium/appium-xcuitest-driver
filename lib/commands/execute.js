import { iosCommands } from 'appium-ios-driver';
import { errors } from 'appium-base-driver';


let extensions = {};

Object.assign(extensions, iosCommands.execute);

const iosExecute = extensions.execute;
extensions.execute = async function (script, args) {
  if (!script.match(/^mobile\:/) && !this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  return await iosExecute.call(this, script, args);
};

const iosExecuteAsync = extensions.executeAsync;
extensions.executeAsync = async function (script, args, sessionId) {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  return await iosExecuteAsync.call(this, script, args, sessionId);
};

// Overrides the 'executeMobile' function defined in appium-ios-driver
extensions.executeMobile = async function (mobileCommand, opts={}) {
  // we only support mobile: scroll and mobile: swipe
  if (mobileCommand === 'scroll') {
    await this.mobileScroll(opts);
  } else if (mobileCommand === 'swipe') {
    await this.mobileScroll(opts, true);
  } else {
    throw new errors.UnknownCommandError('Unknown command, all the mobile commands except scroll and swipe have been removed.');
  }
};

export default extensions;
