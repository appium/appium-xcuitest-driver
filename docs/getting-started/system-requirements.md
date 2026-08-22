---
title: System Requirements
---

There are three primary requirements to use the XCUITest driver:

* macOS host machine
    * Windows and Linux hosts have limited support - see the [Non-macOS Hosts guide](../guides/non-macos-hosts.md)
* Xcode
* Appium

The XCUITest driver aims to _fully support_ the latest _two_ (2) major Xcode/iOS/iPadOS/tvOS/watchOS
versions, but _may_ still fully or partially work with certain older versions. As such, for most
use cases, the latest versions of the above dependencies will work just fine.

??? info "Why not support all OS and Xcode versions?"

    The XCUITest driver depends on the [WebDriverAgent (WDA)](https://github.com/appium/WebDriverAgent)
    framework, which in turn [relies on Apple's XCTest framework](../overview.md). Changes in the
    XCTest API are published in new Xcode and Apple device OS versions. These API changes may not
    only add new features that the driver must implement in order to support the latest devices, but
    also modify or even remove support for existing features that the driver relies on.

However, if automating a device with an older OS version, ^^you may be required to use older
versions of all three of the above^^. Since identifying compatible Xcode, macOS, driver and Appium
server versions is not straightforward, the following approach is recommended:

1. [Device OS to Xcode](#device-os-to-xcode): Xcode versions that officially support your device under
   test
2. [Device OS to Driver](#device-os-to-driver): XCUITest driver versions that support your device under
   test
3. [Driver to Xcode](#driver-to-xcode): Xcode versions that are supported by your XCUITest driver
  version
4. Use the overlap between the Xcode version ranges from Step 1 and Step 3 as your final compatible
   range
5. [Xcode to macOS](#xcode-to-macos): macOS versions that support your Xcode version
6. [Driver to Appium Server](#driver-to-appium-server): Appium server version that supports your
   XCUITest driver version

!!! note

    This document only lists compatibility information starting from iOS/tvOS 9.3 and Xcode 11, as
    these were the minimum supported versions in XCUITest driver 4.0.0, which was the first
    version supporting Appium 2.

    For watchOS, the original minimum supported versions were watchOS 10 and Xcode 15.4.
    
    For iOS/tvOS/Xcode support in driver versions older than 4.0.0 (Appium 1), please refer to
    [the Appium 1 changelog](https://github.com/appium/appium/blob/1.x/CHANGELOG.md).

!!! note

    If you already have the driver installed, you can also verify most of its requirements with the
    built-in Appium Doctor:

    ```
    appium driver doctor xcuitest
    ```

## Device OS to Xcode

Xcode compatibility with a device under test requires Xcode to bundle the SDK for the
iOS/iPadOS/tvOS/watchOS version running on the device. Apple lists the minimum required Xcode
versions in their device SDK release notes, which are linked here. Open the page for the OS version
of your device under test, and look for the line 'The SDK comes bundled with Xcode':

* [iOS & iPadOS Release Notes](https://developer.apple.com/documentation/ios-ipados-release-notes)
* [tvOS Release Notes](https://developer.apple.com/documentation/tvos-release-notes)
* [watchOS Release Notes](https://developer.apple.com/documentation/watchos-release-notes)
    * For driver compatibility, watchOS 10.0 - 10.4 requires Xcode 15.4 or later

The maximum supported Xcode version can be retrieved from the [Xcode Release Notes](https://developer.apple.com/documentation/xcode-release-notes/).
The following table summarizes this data, narrowed for XCUITest driver compatibility: 

| iOS/iPadOS/tvOS version | watchOS version | Last supported Xcode version |
| --- | --- | --- |
| 17.0 - 27.x | 10.x - 27.x | N/A |
| 15.0 - 16.x | N/A[^min-watchos] | Xcode 26.6[^xcode-13] |
| 12.0 - 14.x | N/A[^min-watchos] | Xcode 15.4[^xcode-13] |
| 11.x | N/A[^min-watchos] | Xcode 14.3.1[^xcode-13] |
| 9.3 - 10.x | N/A[^min-watchos] | Xcode 13.2.1 |

## Device OS to Driver

The following tables map device OS versions to their supported driver versions. Versions with the
'not tested' label are still likely to work fine with the latest driver, but any fixes for them
have lesser priority than for newer OS versions, and any major workarounds are unlikely.

If you are downgrading an existing driver installation to adjust its Xcode/OS support range, ensure that
the version of the [WebDriverAgent (WDA)](https://github.com/appium/WebDriverAgent) server
application (which the driver installs on the device under test) is also downgraded accordingly.

### iOS/iPadOS/tvOS

| Device OS version | Fully supported driver/WDA versions | Last likely working driver/WDA version |
| --- | --- | --- |
| >= 26.4 | >= [10.23.2](https://github.com/appium/appium-xcuitest-driver/pull/2733) (WDA >= 11.1.5) | Latest |
| 26.0 - 26.3 | >= 9.5.0 (WDA >= [9.14.1](https://github.com/appium/WebDriverAgent/pull/1032)) | Latest |
| 18.0 - 18.x | >= 7.24.15 (WDA >= [8.9.1](https://github.com/appium/WebDriverAgent/pull/935)) | Latest |
| 17.0 - 17.x | [4.32.23](https://github.com/appium/appium-xcuitest-driver/pull/1822) - 10.1.0 (WDA 5.6.0 - 10.1.0) | Latest (not tested) |
| 16.4 - 16.x | 4.21.7 - 7.26.3 (WDA [4.13.1](https://github.com/appium/WebDriverAgent/pull/681) - 8.9.1) | Latest (not tested) |
| 16.0 - 16.3 | 4.7.4 - 7.26.3 (WDA [4.8.1](https://github.com/appium/WebDriverAgent/pull/597) - 8.9.1) | Latest (not tested) |
| 15.4 - 15.x | 4.3.3 - 5.2.0 (WDA [4.1.6](https://github.com/appium/WebDriverAgent/pull/573) - 5.8.5) | Latest (not tested) |
| 15.0 - 15.3 | 4.0.0 - 5.2.0 (WDA 4.0.0 - 5.8.5) | Latest (not tested) |
| 14.0 - 14.x | 4.0.0 - 4.11.1 (WDA 4.0.0 - 4.8.5) | 4.27.2 (WDA [4.15.1](https://github.com/appium/WebDriverAgent/pull/696)) |
| 9.3 - 13.x | < 4.0.0 | 4.27.2 (WDA [4.15.1](https://github.com/appium/WebDriverAgent/pull/696)) |

### watchOS

| Device OS version | Fully supported driver/WDA versions | Last likely working driver/WDA version |
| --- | --- | --- |
| >= 27.0 | >= 12.6.0 (WDA >= [16.5.0](https://github.com/appium/WebDriverAgent/pull/1217)) | Latest |
| 26.0 - 26.x | >= 12.6.0 (WDA >= [16.5.0](https://github.com/appium/WebDriverAgent/pull/1217)) | Latest |
| 11.0 - 11.x | >= 12.6.0 (WDA >= [16.5.0](https://github.com/appium/WebDriverAgent/pull/1217)) | Latest |
| 10.0 - 10.x | >= 12.6.0 (WDA >= [16.5.0](https://github.com/appium/WebDriverAgent/pull/1217)) | Latest (not tested) |

## Driver to Xcode

The following table maps driver versions to their supported Xcode version ranges. Similarly to the
above tables, fixes for Xcode versions in the last column have lesser priority than for newer Xcode
versions, and any major workarounds are unlikely.

| XCUITest driver/WDA version | Full Xcode support | Oldest likely working Xcode version |
| --- | --- | --- |
| >= [11.1.2](https://github.com/appium/appium-xcuitest-driver/pull/2872) (>= WDA 14.1.1) | >= Xcode 16.0 | Xcode 14.0 |
| [10.7.0](https://github.com/appium/appium-xcuitest-driver/pull/2658) - 11.11.1 (WDA 10.2.2 - 14.1.1) | Xcode 16.0 - 26.x | Xcode 14.0 |
| 10.1.1 - 10.6.0 (WDA 10.1.2 - 10.2.2) | Xcode 16.0 - 26.x | Xcode 13.0 |
| 9.5.0 - 10.1.0 (WDA [9.14.1](https://github.com/appium/WebDriverAgent/pull/1032) - 10.1.1) | Xcode 15.0 - 26.x | Xcode 13.0 |
| 7.26.4 - 9.4.0 (WDA 8.9.3 - 9.14.0) | Xcode 15.0 - 16.x | Xcode 13.0 |
| 7.24.15 - 7.26.3 (WDA [8.9.1](https://github.com/appium/WebDriverAgent/pull/935) - 8.9.2) | Xcode 14.0 - 16.x | Xcode 13.0 |
| 5.2.1 - 7.24.14 (WDA 5.8.6 - 8.9.0) | Xcode 14.0 - 15.x | Xcode 13.0 |
| [4.32.23](https://github.com/appium/appium-xcuitest-driver/pull/1822) - 5.2.0 (WDA 5.6.0 - 5.8.5) | Xcode 13.0 - 15.x | Xcode 13.0 |
| 4.28.0 - 4.32.22 (WDA [5.0.0](https://github.com/appium/WebDriverAgent/pull/696) - 5.6.0) | Xcode 13.0 - 14.x | Xcode 13.0 |
| 4.21.7 - 4.27.2 (WDA [4.13.1](https://github.com/appium/WebDriverAgent/pull/681) - 4.15.1) | Xcode 13.0 - 14.x | Xcode 12.0 |
| 4.12.0 - 4.21.6 (WDA 4.8.6 - 4.13.0) | Xcode 13.0 - 14.2 | Xcode 12.0 |
| 4.7.4 - 4.11.1 (WDA [4.8.1](https://github.com/appium/WebDriverAgent/pull/597) - 4.8.5) | Xcode 12.0 - 14.2 | Xcode 12.0 |
| 4.3.3 - 4.7.3 (WDA [4.1.6](https://github.com/appium/WebDriverAgent/pull/573) - 4.8.0) | Xcode 12.0 - 13.x | Xcode 12.0 |
| 4.2.0 - 4.3.2 (WDA [4.1.0](https://github.com/appium/WebDriverAgent/pull/557) - 4.1.5) | Xcode 12.0 - 13.2 | Xcode 12.0 |
| 4.0.0 - 4.1.0 (WDA 4.0.0) | Xcode 11.0 - 13.2 | Xcode 11.0 |

## Xcode to macOS

Similarly to device OS compatibility with Xcode, any Xcode version also has a minimum and maximum
supported macOS version. Apple lists the minimum required macOS versions in the
[Xcode Release Notes](https://developer.apple.com/documentation/xcode-release-notes/):
open the page for the your Xcode version and look for the line 'requires a Mac running`.

Maximum supported macOS versions are not listed in the release notes (with exceptions), but it can
generally be assumed that if the first release of a major Xcode version requires at least macOS
version `X`, then it will no longer run on macOS version `X+2`:[^xcode-macos]

| Xcode version | Last supported macOS version |
| --- | --- |
| 27.0 | N/A |
| 26.0 - 26.x | macOS 26.x |
| 16.4 | macOS 26.1 |
| 16.0 - 16.3 | macOS 15.x |
| 15.0 - 15.x | macOS 14.x |
| 14.0 - 14.x | macOS 13.x |
| 13.0 - 13.x | macOS 12.x |
| 12.0 - 12.x | macOS 11.x |
| 11.0 - 11.x | macOS 10.15.x |

## Driver to Appium Server

Make sure to install a version of Appium that supports your target driver version. The requirements
and prerequisites of Appium itself can be found in [the Appium documentation](https://appium.io/docs/en/latest/quickstart/install/).

| XCUITest driver version | Supported Appium server version |
| --- | --- |
| >= 10.0.0 | Appium 3 |
| 4.0.0 - 9.10.5 | Appium 2 |

## Other Requirements

- If automating real devices, additional manual configuration is required - please refer to the
  [Real Device Setup](./device-setup.md#real-devices) guide.
- If testing web or hybrid apps, their webviews must be debuggable. If it is not possible to connect to your
  webview(s) using [Safari remote debugger](https://appletoolbox.com/use-web-inspector-debug-mobile-safari/),
  then the driver will not be able to identify them.

### Optional Requirements

- [`ffmpeg`](https://ffmpeg.org/) is used for test video recording. It can be installed using
  [`brew`](https://brew.sh/): `brew install ffmpeg`
- [`go-ios`](https://github.com/danielpaulus/go-ios) can be used to improve device interactions
- [WIX AppleSimulatorUtils](https://github.com/wix/AppleSimulatorUtils) can be used to improve some
  Simulator interactions

[^min-watchos]: watchOS 9 and earlier are not supported by any XCUITest driver version
[^xcode-13]: Devices running iOS/iPadOS/tvOS versions older than 15.4 are not supported by Xcode
13.3 - 13.4.1
[^xcode-macos]: Refer to this [StackOverflow post](https://stackoverflow.com/questions/78996419/xcode-15-is-not-running-in-macos-sequoia)
