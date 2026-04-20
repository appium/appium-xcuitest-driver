---
title: Device Preparation
---

Before using the XCUITest driver with any device (either simulator or real device), additional
configuration is required on the device itself.

## Automatic Adjustments

The driver automatically adjusts certain device settings. Currently this only applies to
keyboard-related preferences. Some of these preferences can still be adjusted manually via the
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
lifted beforehand.

### Trusting the Device

The device [needs to be trusted in order to appear as a run destination in Xcode](https://developer.apple.com/documentation/xcode/pairing-your-devices-with-xcode#Manage-your-real-devices-in-Xcode).

#### Wired Devices

1. On your macOS computer, open Xcode
2. Physically connect the device to the computer
3. On the device, a _Trust This Computer_ popup should appear - accept it

#### Wireless tvOS Devices

1. On your macOS computer, open Xcode
2. Ensure the Apple TV is on the same network as the macOS host (no firewall blocking)
3. On the Apple TV, enable discovery mode in _Settings_ -> _Remotes and Devices_ -> _Remote App and Device_
4. In Xcode, open _Window_ -> _Devices and Simulators_ - the Apple TV should appear
5. Click _Pair_, enter the PIN that appears on the Apple TV, then click _Connect_
6. On the Apple TV, a _Trust This Computer_ popup should appear - accept it

### Required Settings

- The device must have [Developer Mode enabled](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device)
  (iOS/iPadOS/tvOS 16+ only):

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
