import _ from 'lodash';
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
  const mobileCommandsMapping = {
    scroll: async (x) => await this.mobileScroll(x),
    swipe: async (x) => await this.mobileScroll(x, true),
    pinch: async (x) => await this.mobilePinch(x),
    doubleTap: async (x) => await this.mobileDoubleTap(x),
    twoFingerTap: async (x) => await this.mobileTwoFingerTap(x),
    touchAndHold: async (x) => await this.mobileTouchAndHold(x),
    tap: async (x) => await this.mobileTap(x),
    dragFromToForDuration: async (x) => await this.mobileDragFromToForDuration(x),
    selectPickerWheelValue: async (x) => await this.mobileSelectPickerWheelValue(x),
    alert: async (x) => await this.mobileHandleAlert(x)
  };

  if (!_.has(mobileCommandsMapping, mobileCommand)) {
    throw new errors.UnknownCommandError(`Unknown mobile command "${mobileCommand}". Only ${_.keys(mobileCommandsMapping)} commands are supported.`);
  }
  return await mobileCommandsMapping[mobileCommand](opts);
};

export default extensions;
