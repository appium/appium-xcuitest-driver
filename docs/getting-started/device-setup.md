---
title: Device Preparation
---

Before using the XCUITest driver with any device (either simulator or real device), additional
configuration is required on the device itself.

## Automatic Adjustments

The driver automatically adjusts certain device settings. Currently this only applies to
keyboard-related preferences. Some of these preferences still be adjusted manually via the
[Settings API](https://appium.io/docs/en/latest/guides/settings/).

- _Settings -> General -> Keyboard -> Auto-Correction_ is turned OFF
- _Settings -> General -> Keyboard -> Predictive Text_ is turned OFF
- The keyboard tutorial is marked as complete
- (Simulator Only) Software keyboard is turned ON

## Accessibility Settings

Certain accessibility settings may affect the elements shown in the application page source.

- Ensure zoom is turned off in order to avoid miscalculation of element coordinates:

    > _Settings_ -> _Accessibility_ -> _Zoom_ -> Turn _Zoom_ OFF

- Other settings may be adjusted depending on your testing requirements:

    > _Settings_ -> _Accessibility_ -> _Read & Speak_ -> _Speak Selection_

## Real Devices

In order to communicate with both simulators and real devices, the XCUITest driver must install
the `WebDriverAgentRunner-Runner` (WDA) application on the device. Unlike simulators, real devices
will not allow this by default, and have several security restrictions that need to be manually
lifted beforehand:

- The device [needs to be trusted](https://developer.apple.com/documentation/xcode/pairing-your-devices-with-xcode#Manage-your-real-devices-in-Xcode):

    1. On your macOS computer, open Xcode
    2. Physically connect the device to the computer
    3. On the device, a Trust This Computer popup should appear - accept it

- The device must have [Developer Mode enabled](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device) (iOS/iPadOS 16+ only):

    > _Settings_ -> _Privacy & Security_ -> _Developer Mode_ -> Turn _Developer Mode_ ON

    You can also use the `devmodectl streaming` CLI on macOS 13+ and install development signed
    apps to enable this mode.

- UI Automation must be enabled:

    > _Settings_ -> _Developer_ -> Turn _Enable UI Automation_ ON

- For webview testing, Safari automation-related settings must be enabled:

    > _Settings_ -> _Apps_ -> _Safari_ -> _Advanced_ -> Turn _Web Inspector_ ON

    > _Settings_ -> _Apps_ -> _Safari_ -> _Advanced_ -> Turn _Remote Automation_ ON

### Provisioning Profile

In addition to all of the above device configuration, the WDA application must have a valid
provisioning profile in order for it to be installable on your target device. Refer to
[the Provisioning Profile guide](./provisioning-profile/index.md) for more details on how to
configure this.
