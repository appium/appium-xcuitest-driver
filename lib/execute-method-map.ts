import {ExecuteMethodMap} from '@appium/types';
import {XCUITestDriver} from './driver';

export const executeMethodMap = {
  'mobile: tap': {
    command: 'mobileTap',
    params: {required: ['x', 'y'], optional: ['elementId']},
  },
  'mobile: scroll': {
    command: 'mobileScroll',
    params: {
      optional: ['name', 'direction', 'predicateString', 'toVisible', 'distance', 'elementId'],
    },
  },
  'mobile: selectPickerWheelValue': {
    command: 'mobileSelectPickerWheelValue',
    params: {
      required: ['elementId', 'order'],
      optional: ['offset'],
    },
  },
  'mobile: sendMemoryWarning': {
    command: 'mobileSendMemoryWarning',
    params: {
      required: ['bundleId'],
    },
  },
  // https://developer.apple.com/documentation/xctest/xcuielement/1618668-swipeleft?language=objc
  // https://developer.apple.com/documentation/xctest/xcuielement/1618674-swiperight?language=objc
  // https://developer.apple.com/documentation/xctest/xcuielement/1618667-swipeup?language=objc
  // https://developer.apple.com/documentation/xctest/xcuielement/1618664-swipedown?language=objc
  'mobile: swipe': {
    command: 'mobileSwipe',
    params: {
      required: ['direction'],
      optional: ['velocity', 'elementId'],
    },
  },
  // https://developer.apple.com/documentation/xctest/xcuielement/1618669-pinchwithscale?language=objc
  'mobile: pinch': {
    command: 'mobilePinch',
    params: {
      required: ['scale', 'velocity'],
      optional: ['elementId'],
    },
  },
  // https://developer.apple.com/documentation/xctest/xcuielement/1618673-doubletap?language=objc
  'mobile: doubleTap': {
    command: 'mobileDoubleTap',
    params: {
      optional: ['elementId', 'x', 'y'],
    },
  },
  // https://developer.apple.com/documentation/xctest/xcuielement/1618671-tapwithnumberoftaps?language=objc
  'mobile: twoFingerTap': {
    command: 'mobileTwoFingerTap',
    params: {
      optional: ['elementId'],
    },
  },
  'mobile: tapWithNumberOfTaps': {
    command: 'mobileTapWithNumberOfTaps',
    params: {
      optional: ['numberOfTouches', 'numberOfTaps', 'elementId'],
    },
  },
  // https://developer.apple.com/documentation/xctest/xcuielement/1618663-pressforduration?language=objc
  'mobile: touchAndHold': {
    command: 'mobileTouchAndHold',
    params: {
      required: ['duration'],
      optional: ['x', 'y', 'elementId'],
    },
  },
  // https://developer.apple.com/documentation/xctest/xcuielement/1618670-pressforduration?language=objc
  'mobile: dragFromToForDuration': {
    command: 'mobileDragFromToForDuration',
    params: {
      required: ['duration', 'fromX', 'fromY', 'toX', 'toY'],
      optional: ['elementId'],
    },
  },
  // https://developer.apple.com/documentation/xctest/xcuielement/1618665-rotate?language=objc
  'mobile: rotateElement': {
    command: 'mobileRotateElement',
    params: {
      required: ['rotation', 'velocity'],
      optional: ['elementId'],
    },
  },
  // https://developer.apple.com/documentation/xctest/xcuicoordinate/3551692-pressforduration?language=objc
  'mobile: dragFromToWithVelocity': {
    command: 'mobileDragFromToWithVelocity',
    params: {
      required: ['pressDuration', 'holdDuration', 'velocity'],
      optional: ['fromElementId', 'toElementId', 'fromX', 'fromY', 'toX', 'toY'],
    },
  },
  'mobile: forcePress': {
    command: 'mobileForcePress',
    params: {
      optional: ['x', 'y', 'duration', 'pressure', 'elementId'],
    },
  },
  'mobile: scrollToElement': {
    command: 'mobileScrollToElement',
    params: {
      required: ['elementId'],
    },
  },
  'mobile: alert': {
    command: 'mobileHandleAlert',
    params: {
      required: ['action'],
      optional: ['buttonLabel'],
    },
  },
  'mobile: setPasteboard': {
    command: 'mobileSetPasteboard',
    params: {
      required: ['content'],
      optional: ['encoding'],
    },
  },
  'mobile: getPasteboard': {
    command: 'mobileGetPasteboard',
    params: {
      optional: ['encoding'],
    },
  },
  'mobile: source': {
    command: 'mobileGetSource',
    params: {
      optional: ['format', 'excludedAttributes'],
    },
  },
  'mobile: getAppStrings': {
    command: 'getStrings',
    params: {
      optional: ['language', 'stringFile'],
    },
  },
  'mobile: getContexts': {
    command: 'mobileGetContexts',
    params: {
      optional: ['waitForWebviewMs'],
    },
  },
  'mobile: installApp': {
    command: 'mobileInstallApp',
    params: {
      required: ['app'],
      optional: ['timeoutMs', 'checkVersion'],
    },
  },
  'mobile: isAppInstalled': {
    command: 'mobileIsAppInstalled',
    params: {
      required: ['bundleId'],
    },
  },
  'mobile: removeApp': {
    command: 'mobileRemoveApp',
    params: {
      required: ['bundleId'],
    },
  },
  'mobile: launchApp': {
    command: 'mobileLaunchApp',
    params: {
      required: ['bundleId'],
      optional: ['arguments', 'environment'],
    },
  },
  'mobile: terminateApp': {
    command: 'mobileTerminateApp',
    params: {
      required: ['bundleId'],
    },
  },
  'mobile: killApp': {
    command: 'mobileKillApp',
    params: {
      required: ['bundleId'],
    },
  },
  'mobile: queryAppState': {
    command: 'mobileQueryAppState',
    params: {
      required: ['bundleId'],
    },
  },
  'mobile: activateApp': {
    command: 'mobileActivateApp',
    params: {
      required: ['bundleId'],
    },
  },
  'mobile: listApps': {
    command: 'mobileListApps',
    params: {
      optional: ['applicationType'],
    },
  },
  'mobile: clearApp': {
    command: 'mobileClearApp',
    params: {
      required: ['bundleId'],
    },
  },
  'mobile: viewportScreenshot': {
    command: 'getViewportScreenshot',
  },
  'mobile: viewportRect': {
    command: 'getViewportRect',
  },
  'mobile: startPerfRecord': {
    command: 'mobileStartPerfRecord',
    params: {
      optional: ['timeout', 'profileName', 'pid'],
    },
  },
  'mobile: stopPerfRecord': {
    command: 'mobileStopPerfRecord',
    params: {
      optional: [
        'remotePath',
        'user',
        'pass',
        'method',
        'profileName',
        'headers',
        'fileFieldName',
        'formFields',
      ],
    },
  },
  'mobile: installCertificate': {
    command: 'mobileInstallCertificate',
    params: {
      required: ['content'],
      optional: ['commonName', 'isRoot'],
    },
  },
  'mobile: removeCertificate': {
    command: 'mobileRemoveCertificate',
    params: {
      required: ['name'],
    },
  },
  'mobile: listCertificates': {
    command: 'mobileListCertificates',
  },
  'mobile: startLogsBroadcast': {
    command: 'mobileStartLogsBroadcast',
  },
  'mobile: stopLogsBroadcast': {
    command: 'mobileStopLogsBroadcast',
  },
  'mobile: batteryInfo': {
    command: 'mobileGetBatteryInfo',
  },
  'mobile: performAccessibilityAudit': {
    command: 'mobilePerformAccessibilityAudit',
    params: {
      optional: ['auditTypes'],
    },
  },
  'mobile: deviceInfo': {
    command: 'mobileGetDeviceInfo',
  },
  'mobile: getDeviceTime': {
    command: 'mobileGetDeviceTime',
    params: {
      optional: ['format'],
    },
  },
  'mobile: activeAppInfo': {
    command: 'mobileGetActiveAppInfo',
  },
  'mobile: deviceScreenInfo': {
    command: 'getScreenInfo',
  },
  'mobile: pressButton': {
    command: 'mobilePressButton',
    params: {
      required: ['name'],
      optional: ['durationSeconds'],
    },
  },
  'mobile: enrollBiometric': {
    command: 'mobileEnrollBiometric',
    params: {
      optional: ['isEnabled'],
    },
  },
  'mobile: sendBiometricMatch': {
    command: 'mobileSendBiometricMatch',
    params: {
      optional: ['type', 'match'],
    },
  },
  'mobile: isBiometricEnrolled': {
    command: 'mobileIsBiometricEnrolled',
  },
  'mobile: clearKeychains': {
    command: 'mobileClearKeychains',
  },
  'mobile: getPermission': {
    command: 'mobileGetPermission',
    params: {
      required: ['bundleId', 'service'],
    },
  },
  'mobile: setPermission': {
    command: 'mobileSetPermissions',
    params: {
      required: ['access', 'bundleId'],
    },
  },
  'mobile: resetPermission': {
    command: 'mobileResetPermission',
    params: {
      required: ['service'],
    },
  },
  'mobile: getAppearance': {
    command: 'mobileGetAppearance',
  },
  'mobile: setAppearance': {
    command: 'mobileSetAppearance',
    params: {
      required: ['style'],
    },
  },
  'mobile: getClipboard': {
    command: 'getClipboard',
    params: {
      optional: ['contentType'],
    },
  },
  'mobile: setClipboard': {
    command: 'setClipboard',
    params: {
      required: ['content'],
      optional: ['contentType'],
    },
  },
  'mobile: siriCommand': {
    command: 'mobileSiriCommand',
    params: {
      required: ['text'],
    },
  },
  'mobile: pushFile': {
    command: 'mobilePushFile',
    params: {
      required: ['remotePath', 'payload'],
    },
  },
  'mobile: pullFile': {
    command: 'mobilePullFile',
    params: {
      required: ['remotePath'],
    },
  },
  'mobile: pullFolder': {
    command: 'mobilePullFolder',
    params: {
      required: ['remotePath'],
    },
  },
  'mobile: deleteFile': {
    command: 'mobileDeleteFile',
    params: {
      required: ['remotePath'],
    },
  },
  'mobile: deleteFolder': {
    command: 'mobileDeleteFolder',
    params: {
      required: ['remotePath'],
    },
  },
  'mobile: runXCTest': {
    command: 'mobileRunXCTest',
    params: {
      required: ['testRunnerBundleId', 'appUnderTestBundleId', 'xctestBundleId'],
      optional: ['args', 'testType', 'env', 'timeout'],
    },
  },
  'mobile: installXCTestBundle': {
    command: 'mobileInstallXCTestBundle',
    params: {
      required: ['xctestApp'],
    },
  },
  'mobile: listXCTestBundles': {
    command: 'mobileListXCTestBundles',
  },
  'mobile: listXCTestsInTestBundle': {
    command: 'mobileListXCTestsInTestBundle',
    params: {
      required: ['bundle'],
    },
  },
  'mobile: startXCTestScreenRecording': {
    command: 'mobileStartXctestScreenRecording',
    params: {
      optional: ['fps', 'codec'],
    },
  },
  'mobile: getXCTestScreenRecordingInfo': {
    command: 'mobileGetXctestScreenRecordingInfo',
  },
  'mobile: stopXCTestScreenRecording': {
    command: 'mobileStopXctestScreenRecording',
    params: {
      optional: ['remotePath', 'user', 'pass', 'headers', 'fileFieldName', 'formFields', 'method'],
    },
  },
  'mobile: pushNotification': {
    command: 'mobilePushNotification',
    params: {
      required: ['bundleId', 'payload'],
    },
  },
  'mobile: expectNotification': {
    command: 'mobileExpectNotification',
    params: {
      required: ['name'],
      optional: ['type', 'timeoutSeconds'],
    },
  },
  'mobile: performIoHidEvent': {
    command: 'mobilePerformIoHidEvent',
    params: {
      required: ['page', 'usage', 'durationSeconds'],
    },
  },
  'mobile: configureLocalization': {
    command: 'mobileConfigureLocalization',
    params: {
      optional: ['keyboard', 'language', 'locale'],
    },
  },
  'mobile: resetLocationService': {
    command: 'mobileResetLocationService',
  },
  'mobile: startPcap': {
    command: 'mobileStartPcap',
    params: {
      optional: ['timeLimitSec', 'forceRestart'],
    },
  },
  'mobile: stopPcap': {
    command: 'mobileStopPcap',
  },
  'mobile: listConditionInducers': {
    command: 'listConditionInducers',
  },
  'mobile: enableConditionInducer': {
    command: 'enableConditionInducer',
    params: {
      required: ['conditionID', 'profileID'],
    },
  },
  'mobile: disableConditionInducer': {
    command: 'disableConditionInducer',
  },
  'mobile: updateSafariPreferences': {
    command: 'mobileUpdateSafariPreferences',
    params: {
      required: ['preferences'],
    },
  },
  'mobile: calibrateWebToRealCoordinatesTranslation': {
    command: 'mobileCalibrateWebToRealCoordinatesTranslation',
  },
  'mobile: keys': {
    command: 'mobileKeys',
    params: {
      required: ['keys'],
      optional: ['elementId'],
    },
  },
  'mobile: deepLink': {
    command: 'mobileDeepLink',
    params: {
      required: ['url'],
      optional: ['bundleId'],
    },
  },
  'mobile: setSimulatedLocation': {
    command: 'mobileSetSimulatedLocation',
    params: {
      required: ['latitude', 'longitude'],
    },
  },
  'mobile: getSimulatedLocation': {
    command: 'mobileGetSimulatedLocation',
  },
  'mobile: resetSimulatedLocation': {
    command: 'mobileResetSimulatedLocation',
  },
  'mobile: shake': {
    command: 'mobileShake',
  },
  'mobile: startAudioRecording': {
    command: 'startAudioRecording',
    params: {
      required: ['audioInput'],
      optional: [
        'timeLimit',
        'audioCodec',
        'audioBitrate',
        'audioChannels',
        'audioRate',
        'forceRestart',
      ],
    },
  },
  'mobile: stopAudioRecording': {
    command: 'stopAudioRecording',
  },
  'mobile: hideKeyboard': {
    command: 'mobileHideKeyboard',
    params: {
      optional: ['keys'],
    },
  },
  'mobile: isKeyboardShown': {
    command: 'isKeyboardShown',
  },
  'mobile: lock': {
    command: 'lock',
    params: {
      optional: ['seconds'],
    },
  },
  'mobile: unlock': {
    command: 'unlock',
  },
  'mobile: isLocked': {
    command: 'isLocked',
  },
  'mobile: backgroundApp': {
    command: 'background',
    params: {optional: ['seconds']},
  },
  'mobile: simctl': {
    command: 'mobileSimctl',
    params: {
      required: ['command'],
      optional: ['args', 'timeout'],
    },
  },
} as const satisfies ExecuteMethodMap<XCUITestDriver>;
