import type { MethodMap } from '@appium/types';
import type { XCUITestDriver } from './driver';

export const newMethodMap = {
  '/session/:sessionId/timeouts/async_script': {
    POST: {
      command: 'asyncScriptTimeout',
      payloadParams: {required: ['ms']},
      deprecated: true,
    },
  },
  '/session/:sessionId/timeouts/implicit_wait': {
    POST: {
      command: 'implicitWait',
      payloadParams: {required: ['ms']},
      deprecated: true
    },
  },
  '/session/:sessionId/window/:windowhandle/size': {
    GET: {
      command: 'getWindowSize',
      deprecated: true
    }
  },
  '/session/:sessionId/element/:elementId/submit': {
    POST: {
      command: 'submit',
      deprecated: true
    }
  },
  '/session/:sessionId/keys': {
    POST: {
      command: 'keys',
      payloadParams: {required: ['value']},
      deprecated: true
    },
  },
  '/session/:sessionId/element/:elementId/location': {
    GET: {
      command: 'getLocation',
      deprecated: true
    }
  },
  '/session/:sessionId/element/:elementId/location_in_view': {
    GET: {
      command: 'getLocationInView',
      deprecated: true
    }
  },
  '/session/:sessionId/element/:elementId/size': {
    GET: {
      command: 'getSize',
      deprecated: true
    }
  },
  '/session/:sessionId/appium/device/shake': {
    POST: {
      command: 'mobileShake',
      deprecated: true
    }
  },
  '/session/:sessionId/appium/device/lock': {
    POST: {
      command: 'lock',
      payloadParams: {optional: ['seconds']},
      deprecated: true
    },
  },
  '/session/:sessionId/appium/device/unlock': {
    POST: {
      command: 'unlock',
      deprecated: true
    }
  },
  '/session/:sessionId/appium/device/is_locked': {
    POST: {
      command: 'isLocked',
      deprecated: true
    }
  },
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
      deprecated: true
    },
  },
  '/session/:sessionId/appium/simulator/touch_id': {
    POST: {
      command: 'touchId',
      payloadParams: {required: ['match']},
      deprecated: true
    },
  },
  '/session/:sessionId/appium/simulator/toggle_touch_id_enrollment': {
    POST: {
      command: 'toggleEnrollTouchId',
      payloadParams: {optional: ['enabled']},
      deprecated: true
    },
  },
  '/session/:sessionId/appium/app/launch': {
    POST: {
      command: 'launchApp',
      deprecated: true
    }
  },
  '/session/:sessionId/appium/app/close': {
    POST: {
      command: 'closeApp',
      deprecated: true
    }
  },
  '/session/:sessionId/appium/app/reset': {
    POST: {
      command: 'reset',
      deprecated: true
    }
  },
  '/session/:sessionId/appium/app/background': {
    POST: {
      command: 'background',
      payloadParams: {required: ['seconds']},
      deprecated: true
    },
  },
  '/session/:sessionId/appium/app/strings': {
    POST: {
      command: 'getStrings',
      payloadParams: {optional: ['language', 'stringFile']},
      deprecated: true
    },
  },
  '/session/:sessionId/appium/element/:elementId/value': {
    POST: {
      command: 'setValueImmediate',
      payloadParams: {required: ['text']},
      deprecated: true
    },
  },
  '/session/:sessionId/appium/receive_async_response': {
    POST: {
      command: 'receiveAsyncResponse',
      payloadParams: {required: ['response']},
      deprecated: true
    },
  },
  '/session/:sessionId/appium/device/get_clipboard': {
    POST: {
      command: 'getClipboard',
      payloadParams: {optional: ['contentType']},
      deprecated: true
    },
  },
  '/session/:sessionId/appium/device/set_clipboard': {
    POST: {
      command: 'setClipboard',
      payloadParams: {
        required: ['content'],
        optional: ['contentType', 'label'],
      },
      deprecated: true
    },
  },
  '/session/:sessionId/log': {
    POST: {
      command: 'getLog',
      payloadParams: {required: ['type']},
    },
  },
  '/session/:sessionId/log/types': {
    GET: {
      command: 'getLogTypes',
    },
  },
  '/session/:sessionId/location': {
    GET: {
      command: 'getGeoLocation',
      deprecated: true,
    },
    POST: {
      command: 'setGeoLocation',
      payloadParams: {required: ['location']},
      deprecated: true,
    },
  },
} as const satisfies MethodMap<XCUITestDriver>;
