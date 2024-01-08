---
title: Device Preparation
---

Before using the XCUITest driver with a simulator or real device, some device preparation is required.

## Automatic Adjustments

The XCUITest driver automatically adjusts some device preferences for testing purposes.

### Keyboard Configuration

Some keyboard preferences are changed in order to make test runs more stable. You can change some
of them via the [Settings API](https://appium.io/docs/en/latest/guides/settings/).

- _Settings -> General -> Keyboard -> Auto-Correction_ is turned OFF
- _Settings -> General -> Keyboard -> Predictive Text_ is turned OFF
- The keyboard tutorial is marked as complete
- (Simulator Only) Software keyboard is turned ON

## Manual Adjustments

Unfortunately, not all configuration can be done automatically, and some changes must be applied manually.

### Accessibility Settings

- To avoid miscalculation of element coordinates, please make sure the zoom preference is turned off
  in _Settings -> Accessibility -> Zoom_.
- Some accessibility settings may expose additional view elements. Appium does not modify these
  settings automatically, since they could affect the way your application under test performs.
  Please change them manually if needed. Note that the available accessibility content depends on
  the OS version.
    - _Settings -> Accessibility -> Spoken Content -> Speak Selection_

### Webview Testing

- Webviews on iOS/iPadOS 16.4 or above may require additional configuration from the application developer.
  Specifically, the destination `WKWebView` and/or `JSContext` component must have the
  [`isInspectable`](https://developer.apple.com/documentation/webkit/wkwebview/4111163-isinspectable)
  property set to `true`. Please read [the WebKit documentation page](https://webkit.org/blog/13936/enabling-the-inspection-of-web-content-in-apps/)
  for more details on this property.
- Starting from iOS/iPadOS 16.4, the Google Chrome browser also supports webview testing. This feature
  requires Chrome version 115 or newer. Please read
  [the Chrome Developer documentation page](https://developer.chrome.com/blog/debugging-chrome-on-ios/)
  for details on the necessary configuration.

### Real Devices

Some settings are enabled by default on simulators, but need to be manually changed for real devices.
See the [Real Device Configuration](./real-device-config.md) document for details.
