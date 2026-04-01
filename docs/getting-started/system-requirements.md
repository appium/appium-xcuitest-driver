---
title: System Requirements
---

There are three primary requirements to use the XCUITest driver:

* macOS host machine
* Xcode
* Appium

For most use cases, the latest versions of the above will work just fine.

However, if you want to automate devices with an older iOS/iPadOS/tvOS version, ^^you may also be
required to use older versions of all three of the above^^. Use the following compatibility tables
to help identify your target Xcode, macOS, driver and Appium server versions.

!!! note

    This document only lists compatibility information starting from iOS/tvOS 9.3 and Xcode 11, as
    these were the minimum supported versions in XCUITest driver 4.0.0, which was the first
    version supporting Appium 2. For iOS/tvOS/Xcode support in driver versions older than 4.0.0
    (Appium 1), please refer to [the Appium 1 changelog](https://github.com/appium/appium/blob/1.x/CHANGELOG.md).

!!! note

    If you already have the driver installed, you can also verify its requirements with the
    built-in Appium Doctor support:

    ```
    appium driver doctor xcuitest
    ```

## Xcode and macOS

Apple provides a list of Xcode versions and their minimum supported iOS/iPadOS/tvOS and macOS
versions in the [Xcode Release Notes](https://developer.apple.com/documentation/xcode-release-notes/).
However, _maximum_ supported versions are also enforced, but are not explicitly listed.

The aforementioned release notes do allow identifying the upper version limits for iOS/iPadOS/tvOS,
but for macOS, it can generally be assumed that if a major Xcode version requires at least macOS
version `X`, then it will no longer run on macOS version `X+2`. [^xcode-macos]

The following table shows a simplified mapping between iOS/iPadOS/tvOS, Xcode, and macOS versions,
narrowed for XCUITest driver compatibility:

| iOS/iPadOS/tvOS version | Supported Xcode versions (driver-adjusted) | Supported macOS versions |
| --- | --- | -- |
| 26 | Xcode >= 26 | macOS >= 15.6 |
| 18 | Xcode >= 16 | macOS >= 14.3 |
| 17 | Xcode >= 15 | macOS >= 13.3 |
| 16 | Xcode >= 14 | macOS >= 12.5 |
| 15 | Xcode >= 13 | macOS >= 11.3 |
| 14 | Xcode 12 - 15 (except 13.3 - 13.4.1) | macOS 10.15.4 - 14 |
| 13 | Xcode 11 - 15 (except 13.3 - 13.4.1) | macOS 10.14.4 - 14 |
| 12 | Xcode 11 - 15 (except 13.3 - 13.4.1) | macOS 10.14.4 - 14 |
| 11 | Xcode 11 - 14 (except 13.3 - 13.4.1) | macOS 10.14.4 - 13 |
| 10 | Xcode 11 - 13.2.1 | macOS 10.14.4 - 12 |
| 9.3 | Xcode 11 - 13.2.1 | macOS 10.14.4 - 12 |

## Driver Version

The XCUITest driver aims to _fully support_ the latest _two_ (2) major Xcode/iOS/iPadOS/tvOS
versions, but _may_ still fully or partially work with certain older versions.

??? info "Why not support all OS and Xcode versions?"

    The XCUITest driver depends on the [WebDriverAgent (WDA)](https://github.com/appium/WebDriverAgent)
    framework, which in turn [relies on Apple's XCTest framework](../overview.md). Changes in the
    XCTest API are published in new Xcode and Apple device OS versions. These API changes may not
    only add new features that the driver must implement in order to support the latest devices, but
    also modify or even remove support for existing features that the driver relies on.

The following tables map Xcode/OS versions to their supported driver versions. Versions with the
'not tested' label are still likely to work fine with the latest driver, but any fixes for them will
have lesser priority than for newer Xcode/OS versions, and any major workarounds are unlikely. 

If you are downgrading an existing driver installation to adjust its Xcode/OS support range, ensure that
the version of the [WebDriverAgent (WDA)](https://github.com/appium/WebDriverAgent) server
application (which the driver installs on the device under test) is also downgraded accordingly.

| iOS/iPadOS/tvOS version | Fully supported driver/WDA versions | Last likely working driver/WDA version |
| --- | --- | --- |
| >= 26.4 | >= [10.23.2](https://github.com/appium/appium-xcuitest-driver/pull/2733) (WDA >= 11.1.5) | Latest |
| 26.0 - 26.3 | >= 9.5.0 (WDA >= [9.14.1](https://github.com/appium/WebDriverAgent/pull/1032)) | Latest |
| 18.0 - 18.7 | >= 7.24.15 (WDA >= [8.9.1](https://github.com/appium/WebDriverAgent/pull/935)) | Latest |
| 17.0 - 17.7 | [4.32.23](https://github.com/appium/appium-xcuitest-driver/pull/1822) - 10.1.0 (WDA 5.6.0 - 10.1.0) | Latest (not tested) |
| 16.4 - 16.7 | 4.21.7 - 7.26.3 (WDA [4.13.1](https://github.com/appium/WebDriverAgent/pull/681) - 8.9.1) | Latest (not tested) |
| 16.0 - 16.3 | 4.7.4 - 7.26.3 (WDA [4.8.1](https://github.com/appium/WebDriverAgent/pull/597) - 8.9.1) | Latest (not tested) |
| 15.0 - 15.8 | 4.0.0 - 5.2.0 (WDA 4.0.0 - 5.8.5) | Latest (not tested) |
| 14.0 - 14.8 | 4.0.0 - 4.11.1 (WDA 4.0.0 - 4.8.5) | 4.27.2 (WDA [4.15.1](https://github.com/appium/WebDriverAgent/pull/696)) |
| 9.3 - 13.7 | < 4.0.0 | 4.27.2 (WDA [4.15.1](https://github.com/appium/WebDriverAgent/pull/696)) |

| Xcode version | Fully supported driver/WDA versions | Last likely working driver/WDA version |
| --- | --- | --- |
| Xcode >= 26.0 | >= 9.5.0 (WDA >= [9.14.1](https://github.com/appium/WebDriverAgent/pull/1032)) | Latest |
| Xcode 16.0 - 16.4 | >= 7.24.15 (WDA >= [8.9.1](https://github.com/appium/WebDriverAgent/pull/935)) | Latest |
| Xcode 15.0 - 15.4 | [4.32.23](https://github.com/appium/appium-xcuitest-driver/pull/1822) - 10.1.0 (WDA 5.6.0 - 10.1.0) | Latest (not tested) |
| Xcode 14.3 | 4.21.7 - 7.26.3 (WDA [4.13.1](https://github.com/appium/WebDriverAgent/pull/681) - 8.9.1) | Latest (not tested) |
| Xcode 14.0 - 14.2 | 4.7.4 - 7.26.3 (WDA [4.8.1](https://github.com/appium/WebDriverAgent/pull/597) - 8.9.1) | Latest (not tested) |
| Xcode 13.3 - 13.4 | 4.3.3 - 5.2.0 (WDA [4.1.6](https://github.com/appium/WebDriverAgent/pull/573) - 5.8.5) | [10.6.0](https://github.com/appium/appium-xcuitest-driver/pull/2658) (WDA 10.2.2) |
| Xcode 13.0 - 13.2 | 4.0.0 - 5.2.0 (WDA 4.0.0 - 5.8.5) | [10.6.0](https://github.com/appium/appium-xcuitest-driver/pull/2658) (WDA 10.2.2) |
| Xcode 12.0 - 12.5 | 4.0.0 - 4.11.1 (WDA 4.0.0 - 4.8.5) | 4.27.2 (WDA [4.15.1](https://github.com/appium/WebDriverAgent/pull/696)) |
| Xcode 11.0 - 11.7 | < 4.0.0 | 4.2.0 (WDA [4.0.0](https://github.com/appium/WebDriverAgent/pull/557)) |

## Appium Server

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
- [`py-ios-device`](https://github.com/YueChen-C/py-ios-device) is required in several `mobile:`
  extensions, and can improve the general testing experience for real devices

[^xcode-macos]: Refer to this [StackOverflow post](https://stackoverflow.com/questions/78996419/xcode-15-is-not-running-in-macos-sequoia)
