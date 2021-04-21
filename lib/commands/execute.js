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
  };

  if (!_.has(commandMap, mobileCommand)) {
    throw new errors.UnknownCommandError(`Unknown mobile command '${mobileCommand}'. Only ${_.keys(commandMap).join(', ')} commands are supported.`);
  }
  return await this[commandMap[mobileCommand]](opts);
};

export default extensions;
