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

export default extensions;
