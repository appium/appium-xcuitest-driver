import _ from 'lodash';
import { iosCommands } from 'appium-ios-driver';
import { errors } from 'appium-base-driver';


let extensions = {};

Object.assign(extensions, iosCommands.execute);

const iosExecute = extensions.execute;
extensions.execute = async function execute (script, args) {
  if (!script.match(/^mobile:/) && !this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  return await iosExecute.call(this, script, args);
};

extensions.executeAsync = async function executeAsync (script, args) {
  if (!this.isWebContext()) {
    throw new errors.NotImplementedError();
  }

  args = this.convertElementsForAtoms(args);
  this.asyncWaitMs = this.asyncWaitMs || 0;
  const promise = this.remote.executeAtomAsync('execute_async_script', [script, args, this.asyncWaitMs], this.curWebFrames);
  return await this.waitForAtom(promise);
};

// Overrides the 'executeMobile' function defined in appium-ios-driver
extensions.executeMobile = async function executeMobile (mobileCommand, opts = {}) {
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
    getContexts: 'mobileGetContexts',

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

    installCertificate: 'mobileInstallCertificate',

    startLogsBroadcast: 'mobileStartLogsBroadcast',
    stopLogsBroadcast: 'mobileStopLogsBroadcast',

    batteryInfo: 'mobileGetBatteryInfo',
    deviceInfo: 'mobileGetDeviceInfo',
    activeAppInfo: 'mobileGetActiveAppInfo',

    pressButton: 'mobilePressButton',

    enrollBiometric: 'mobileEnrollBiometric',
    sendBiometricMatch: 'mobileSendBiometricMatch',
    isBiometricEnrolled: 'mobileIsBiometricEnrolled',

    clearKeychains: 'mobileClearKeychains',

    getPermission: 'mobileGetPermission',

    siriCommand: 'mobileSiriCommand',
  };

  if (!_.has(commandMap, mobileCommand)) {
    throw new errors.UnknownCommandError(`Unknown mobile command '${mobileCommand}'. Only ${_.keys(commandMap).join(', ')} commands are supported.`);
  }
  return await this[commandMap[mobileCommand]](opts);
};

export default extensions;
