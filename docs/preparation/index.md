---
title: Device Preparation
---

## Automatic device preference update

Appium XCUITest prepares preferences of the device under test automatically.
Some of them are also configurable via Appium capabilities and the Settings API.

### Keyboards configuration

Appium configures keyboard preferences by default to make test runs more stable.
You can change some of them via the Settings API.

- Turn `Auto-Correction` in Keyboards off
- Turn `Predictive` in Keyboards off
- Mark keyboard tutorial as complete
- (Only for Simulator) Toggle software keyboard on

## Manual setup for fine tuning

Automatic configuration availability is limited on iOS, especially for a real device. You may need to manually change the device configuration.

### Enable Web testing availability

Please turn on _Web Inspector_ on iOS device via _Settings_ -> _Safari_ -> _Advanced_

#### If iOS/iPadOS version is 16.4 or above

Make sure the destination `WKWebView` and/or `JSContext` component have [`isInspectable`](https://developer.apple.com/documentation/webkit/wkwebview/4111163-isinspectable) property set to `true`.
Read [Enabling the Inspection of Web Content in Apps](https://webkit.org/blog/13936/enabling-the-inspection-of-web-content-in-apps/) for more details on this property.

#### Chrome v115+ and iOS 16.4+ support Web testing availability

Chrome browser for iOS now provides a remote debugging feature for release versions of the app after the `isInspectable` property has been introduced by Apple.

Please turn on _Web Inspector_ on iOS device via Chrome app -> _Settings_ -> _Content Settings_ -> _Web Inspector_ -> Turn _Web Inspector_ on, then kill the Chrome app process

Please read [Debugging websites in Chrome on iOS 16.4+](https://developer.chrome.com/blog/debugging-chrome-on-ios/) for more details.

### Avoid possible wrong coordinate

Please make sure the zoom preference in accessibility is turned off via _Settings_ -> _Accessibility_ -> _Zoom_. It could cause element coordinates miscalculation.

### Expose more elements if needed

In some cases, enabling of the below preferences helps to make some view elements accessible. Appium does not modify these settings automatically, since they could affect the way your application under test performs. Please change them manually if needed.

- Turn `Spoken Content` in _Settings_ -> _Accessibility_ on
- Turn `Speak Selection` in _Settings_ -> _Accessibility_ on

Note that the available accessibility content depends on the OS version.
