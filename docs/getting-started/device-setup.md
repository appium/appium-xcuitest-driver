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

Communication with wireless tvOS devices is more complex than for wired devices, resulting in
additional requirements that depend on the tvOS version of the device under test.

| tvOS version | Required XCUITest driver version |
| --- | --- |
| >= 18 | >= 10.30.0 |
| >= 17 | >= 10.10.0 |
| <= 16 | [Same as common requirements](./system-requirements.md#driver-version) |

Devices running tvOS >= 17 rely on `devicectl` instead of the default `usbmuxd`. This requires
running the Appium server with the `APPIUM_XCUITEST_PREFER_DEVICECTL=1` flag. Refer to the
[Environment Variables document](../reference/env-vars.md) for more details.

Devices running tvOS >= 18 rely on RemoteXPC communication, and such devices must be explicitly
paired first. Refer to the [Apple TV Pairing](../guides/remotexpc-apple-tv-pairing.md) guide for
details. While the above `devicectl` approach may also work, it has some limitations, so it is
recommended to use the RemoteXPC pairing approach if possible.

### Required Settings

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
