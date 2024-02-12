export const newMethodMap = /** @type {const} */ ({
  '/session/:sessionId/timeouts/async_script': {
    POST: {
      command: 'asyncScriptTimeout',
      payloadParams: {required: ['ms']},
    },
  },
  '/session/:sessionId/timeouts/implicit_wait': {
    POST: {command: 'implicitWait', payloadParams: {required: ['ms']}},
  },
  '/session/:sessionId/window/:windowhandle/size': {GET: {command: 'getWindowSize'}},
  '/session/:sessionId/element/:elementId/submit': {POST: {command: 'submit'}},
  '/session/:sessionId/keys': {
    POST: {command: 'keys', payloadParams: {required: ['value']}},
  },
  '/session/:sessionId/element/:elementId/location': {GET: {command: 'getLocation'}},
  '/session/:sessionId/element/:elementId/location_in_view': {GET: {command: 'getLocationInView'}},
  '/session/:sessionId/element/:elementId/size': {GET: {command: 'getSize'}},
  '/session/:sessionId/appium/device/shake': {POST: {command: 'mobileShake'}},
  '/session/:sessionId/appium/device/lock': {
    POST: {command: 'lock', payloadParams: {optional: ['seconds']}},
  },
  '/session/:sessionId/appium/device/unlock': {POST: {command: 'unlock'}},
  '/session/:sessionId/appium/device/is_locked': {POST: {command: 'isLocked'}},
  '/session/:sessionId/appium/start_recording_screen': {
    POST: {
      command: 'startRecordingScreen',
      payloadParams: {optional: ['options']},
    },
  },
  '/session/:sessionId/appium/stop_recording_screen': {
    POST: {
      command: 'stopRecordingScreen',
      payloadParams: {optional: ['options']},
    },
  },
  '/session/:sessionId/appium/device/app_state': {
    POST: {
      command: 'queryAppState',
      payloadParams: {required: [['appId'], ['bundleId']]},
    },
  },
  '/session/:sessionId/appium/simulator/touch_id': {
    POST: {command: 'touchId', payloadParams: {required: ['match']}},
  },
  '/session/:sessionId/appium/simulator/toggle_touch_id_enrollment': {
    POST: {
      command: 'toggleEnrollTouchId',
      payloadParams: {optional: ['enabled']},
    },
  },
  '/session/:sessionId/appium/app/launch': {POST: {command: 'launchApp'}},
  '/session/:sessionId/appium/app/close': {POST: {command: 'closeApp'}},
  '/session/:sessionId/appium/app/reset': {POST: {command: 'reset'}},
  '/session/:sessionId/appium/app/background': {
    POST: {
      command: 'background',
      payloadParams: {required: ['seconds']},
    },
  },
  '/session/:sessionId/appium/app/strings': {
    POST: {
      command: 'getStrings',
      payloadParams: {optional: ['language', 'stringFile']},
    },
  },
  '/session/:sessionId/appium/element/:elementId/value': {
    POST: {
      command: 'setValueImmediate',
      payloadParams: {required: ['text']},
    },
  },
  '/session/:sessionId/appium/receive_async_response': {
    POST: {
      command: 'receiveAsyncResponse',
      payloadParams: {required: ['response']},
    },
  },
  '/session/:sessionId/appium/device/get_clipboard': {
    POST: {
      command: 'getClipboard',
      payloadParams: {optional: ['contentType']},
    },
  },
  '/session/:sessionId/appium/device/set_clipboard': {
    POST: {
      command: 'setClipboard',
      payloadParams: {
        required: ['content'],
        optional: ['contentType', 'label'],
      },
    },
  },
});
