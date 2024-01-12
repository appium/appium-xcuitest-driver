---
title: System Requirements
---

## Main Dependencies

Like all Appium drivers, the XCUITest driver requires Appium to be installed. Refer to the
[Appium documentation](https://appium.io/docs/en/latest/quickstart/install/) for its requirements
and prerequisites.

!!! note

    Since version 4.0.0, the XCUITest driver has dropped support for Appium 1, and is only compatible
    with Appium 2.

In addition to Appium system requirements, the XCUITest driver expects the following prerequisites:

- Only macOS is supported as the host platform
- Xcode and Xcode Developer Tools must be installed
    - The Appium team usually needs some time to add support for the most recent Xcode/iOS versions,
      especially beta versions (check the [Xcode/iOS version support](#xcodeios-version-support) section)
- If automating real devices, additional manual configuration is required. Please check the
  [Real Device Configuration](../preparation/real-device-config.md) document for more details.
- Webviews must be debuggable in order to test them. If it is not possible to connect to your
  webview(s) using [Safari remote debugger](https://appletoolbox.com/use-web-inspector-debug-mobile-safari/),
  then the driver will not be able to identify them.

## Optional Dependencies

- [`xcpretty`](https://github.com/supermarin/xcpretty) can be used to make Xcode output easier to
  read. It can be installed by running `gem install xcpretty`.
- [`ffmpeg`](https://ffmpeg.org/) is used for test video recording. It can be installed using
  [`brew`](https://brew.sh/): `brew install ffmpeg`
- [`idb`](https://github.com/facebook/idb), [`go-ios`](https://github.com/danielpaulus/go-ios) and
  [`tidevice`](https://github.com/alibaba/taobao-iphone-device) can be used to improve device interactions
- [WIX AppleSimulatorUtils](https://github.com/wix/AppleSimulatorUtils) can be used to improve some
  Simulator interactions
- [`py-ios-device`](https://github.com/YueChen-C/py-ios-device) is required in several `mobile:`
  extensions, and can improve the general testing experience for real devices

## Validate Dependencies Using Doctor

Since driver version 5.13.0, you can automate the validation for the most of the above requirements
as well as various optional ones needed by driver extensions by running the
`appium driver doctor xcuitest` command.

## Xcode/iOS Version Support

Apple regularly updates the XCTest framework (which is used by the XCUITest driver) and publishes
the changes with Xcode and iOS. Many major and even some minor iOS versions include breaking changes
in the XCTest API. The following table specifies the minimum required XCUITest driver version that
is compatible with such Xcode/iOS versions:

| Xcode/iOS version | Minimum required XCUITest driver version |
| --- | --- |
| Xcode 13 / iOS 15 | 3.48.0 |
| Xcode 14-beta.3 / iOS 16 Beta | 4.7.4 |
| Xcode 14.3 / iOS 16.4 | 4.21.7 |
| Xcode 15 / iOS 17 | 4.35.0 |

Eventually, in order to simplify the client code and to have access to newer platform features, the
Appium team drops supports for legacy XCTest implementations. The following table lists Xcode/iOS
versions that are no longer supported by the XCUITest driver, along with the most recent driver
version that _does_ still supports them. The general aim is to support at least the _current major_
platform version and the _previous major_ one.

| Xcode/iOS version | Last compatible XCUITest driver version |
| --- | --- |
| Xcode 8 / iOS 10 | 2.95.0 |
| Xcode 9 / iOS 11 | 2.133.1 |
| Xcode 10-10.1 / iOS 12-12.1 | 3.31.1 |
| Xcode 10.2 / iOS 12.2 | 3.56.3 |
| Xcode 11 / iOS 13 | 4.3.2 |
| Xcode 12 / iOS 14 | 4.27.2 |
