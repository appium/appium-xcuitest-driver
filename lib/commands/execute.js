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
extensions.executeMobile = async function (mobileCommand, opts = {}) {
  const commandMap = {
    //region gestures support
    scroll: 'mobileScroll',
    swipe: 'mobileSwipe',
    pinch: 'mobilePinch',
    doubleTap: 'mobileDoubleTap',
    twoFingerTap: 'mobileTwoFingerTap',
    touchAndHold: 'mobileTouchAndHold',
    tap: 'mobileTap',
    dragFromToForDuration: 'mobileDragFromToForDuration',
    selectPickerWheelValue: 'mobileSelectPickerWheelValue',
    //endregion gestures support
    alert: 'mobileHandleAlert',
    setPasteboard: 'mobileSetPasteboard',
    getPasteboard: 'mobileGetPasteboard',
    source: 'mobileGetSource',
    //region multiple apps management
    installApp: 'mobileInstallApp',
    isAppInstalled: 'mobileIsAppInstalled',
    removeApp: 'mobileRemoveApp',
    launchApp: 'mobileLaunchApp',
    terminateApp: 'mobileTerminateApp',
    queryAppState: 'mobileQueryAppState',
    activateApp: 'mobileActivateApp',
    //endregion multiple apps management
    viewportScreenshot: 'getViewportScreenshot',
    startPerfRecord: 'mobileStartPerfRecord',
    stopPerfRecord: 'mobileStopPerfRecord',
  };

  if (!_.has(commandMap, mobileCommand)) {
    throw new errors.UnknownCommandError(`Unknown mobile command "${mobileCommand}". Only ${_.keys(commandMap)} commands are supported.`);
  }
  return await this[commandMap[mobileCommand]](opts);
};

export default extensions;
