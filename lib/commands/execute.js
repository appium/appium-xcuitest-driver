import _ from 'lodash';
import {
  errors, errorFromCode, errorFromW3CJsonCode
} from 'appium-base-driver';
import log from '../logger';
import { util } from 'appium-support';

const extensions = {};

extensions.receiveAsyncResponse = async function receiveAsyncResponse (status, value) { // eslint-disable-line require-await
  log.debug(`Received async response: ${JSON.stringify(value)}`);
  if (!util.hasValue(this.asyncPromise)) {
    log.warn(`Received async response when we were not expecting one! ` +
      `Response was: ${JSON.stringify(value)}`);
    return;
  }

  if (util.hasValue(status) && status !== 0) {
    // MJSONWP
    return this.asyncPromise.reject(errorFromCode(status, value.message));
  }
  if (!util.hasValue(status) && value && _.isString(value.error)) {
    // W3C
    return this.asyncPromise.reject(errorFromW3CJsonCode(value.error, value.message, value.stacktrace));
  }
  return this.asyncPromise.resolve(value);
};

extensions.execute = async function execute (script, args) {
  if (script.match(/^mobile:/)) {
    script = script.replace(/^mobile:/, '').trim();
    return await this.executeMobile(script, _.isArray(args) ? args[0] : args);
  } else if (this.isWebContext()) {
    args = this.convertElementsForAtoms(args);
    const result = await this.executeAtom('execute_script', [script, args]);
    return this.cacheWebElements(result);
  } else {
    throw new errors.NotImplementedError();
  }
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

extensions.executeMobile = async function executeMobile (mobileCommand, opts = {}) {
  const commandMap = {
    //region gestures support
    tap: 'mobileTap',
    scroll: 'mobileScroll',
    selectPickerWheelValue: 'mobileSelectPickerWheelValue',
    // https://developer.apple.com/documentation/xctest/xcuielement/1618668-swipeleft?language=objc
    // https://developer.apple.com/documentation/xctest/xcuielement/1618674-swiperight?language=objc
    // https://developer.apple.com/documentation/xctest/xcuielement/1618667-swipeup?language=objc
    // https://developer.apple.com/documentation/xctest/xcuielement/1618664-swipedown?language=objc
    swipe: 'mobileSwipe',
    // https://developer.apple.com/documentation/xctest/xcuielement/1618669-pinchwithscale?language=objc
    pinch: 'mobilePinch',
    // https://developer.apple.com/documentation/xctest/xcuielement/1618673-doubletap?language=objc
    doubleTap: 'mobileDoubleTap',
    // https://developer.apple.com/documentation/xctest/xcuielement/1618675-twofingertap?language=objc
    twoFingerTap: 'mobileTwoFingerTap',
    // https://developer.apple.com/documentation/xctest/xcuielement/1618671-tapwithnumberoftaps?language=objc
    tapWithNumberOfTaps: 'mobileTapWithNumberOfTaps',
    // https://developer.apple.com/documentation/xctest/xcuielement/1618663-pressforduration?language=objc
    touchAndHold: 'mobileTouchAndHold',
    // https://developer.apple.com/documentation/xctest/xcuielement/1618670-pressforduration?language=objc
    dragFromToForDuration: 'mobileDragFromToForDuration',
    // https://developer.apple.com/documentation/xctest/xcuielement/1618665-rotate?language=objc
    rotateElement: 'mobileRotateElement',

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
    listApps: 'mobileListApps',
    //endregion multiple apps management

    viewportScreenshot: 'getViewportScreenshot',
    viewportRect: 'getViewportRect',

    startPerfRecord: 'mobileStartPerfRecord',
    stopPerfRecord: 'mobileStopPerfRecord',

    installCertificate: 'mobileInstallCertificate',

    startLogsBroadcast: 'mobileStartLogsBroadcast',
    stopLogsBroadcast: 'mobileStopLogsBroadcast',

    batteryInfo: 'mobileGetBatteryInfo',
    deviceInfo: 'mobileGetDeviceInfo',
    getDeviceTime: 'mobileGetDeviceTime',
    activeAppInfo: 'mobileGetActiveAppInfo',
    deviceScreenInfo: 'getScreenInfo',

    pressButton: 'mobilePressButton',

    enrollBiometric: 'mobileEnrollBiometric',
    sendBiometricMatch: 'mobileSendBiometricMatch',
    isBiometricEnrolled: 'mobileIsBiometricEnrolled',

    clearKeychains: 'mobileClearKeychains',

    getPermission: 'mobileGetPermission',
    setPermission: 'mobileSetPermissions',
    resetPermission: 'mobileResetPermission',

    getAppearance: 'mobileGetAppearance',
    setAppearance: 'mobileSetAppearance',

    siriCommand: 'mobileSiriCommand',

    deleteFile: 'mobileDeleteFile',
    deleteFolder: 'mobileDeleteFolder',

    startAudioRecording: 'startAudioRecording',
    stopAudioRecording: 'stopAudioRecording',

    // XCTest
    runXCTest: 'mobileRunXCTest',
    installXCTestBundle: 'mobileInstallXCTestBundle',
    listXCTestBundles: 'mobileListXCTestBundles',
    listXCTestsInTestBundle: 'mobileListXCTestsInTestBundle',

    pushNotification: 'mobilePushNotification',
    expectNotification: 'mobileExpectNotification',

    performIoHidEvent: 'mobilePerformIoHidEvent',

    configureLocalization: 'mobileConfigureLocalization',

    resetLocationService: 'mobileResetLocationService',
  };

  if (!_.has(commandMap, mobileCommand)) {
    throw new errors.UnknownCommandError(`Unknown mobile command '${mobileCommand}'. Only ${_.keys(commandMap).join(', ')} commands are supported.`);
  }
  return await this[commandMap[mobileCommand]](opts);
};

export default extensions;
