---
title: Setup & Requirements
---

## Installation

!!! note

    Since version 4.0.0 XCUITest driver has dropped the support of Appium 1, and is only compatible
    with Appium 2.

Use the Appium [extension CLI](https://appium.github.io/appium/docs/en/latest/cli/extensions/) to
add this driver to your Appium 2 install:

```bash
appium driver install xcuitest
```

Alternatively, if you are running a Node.js project, you can include `appium-xcuitest-driver` as
one of your dependencies.

## Requirements

On top of standard Appium requirements XCUITest driver also expects the following prerequisites:

- Only macOS is supported as the host platform
- Xcode and developer tools must be installed. Note, that usually some time is needed for the Appium team to pick up with the support of the most recent Xcode versions, especially beta ones (check [Xcode version support](#xcode-version-support) section below).
- Connected real devices must be trusted, added to your developer profile and configured properly along with WebDriverAgent signing. Read [Real devices](#real-devices) section _carefully_ to set them up properly before running your tests.
- iOS/iPadOS 16 real devices require enabling developer mode. Please read [Enabling Developer Mode on a device](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device) for more details. `devmodectl streaming` CLI on macOS 13+ and installing development signed apps also help enabling the mode.
- Consider using earlier releases of the driver (check [Xcode version support](#xcode-version-support) section below) if it is necessary to test iOS versions older than the current iOS major version minus one on real devices. Also, it is highly recommended to always use the same major version of Xcode SDK, which was used to build the particular iOS/tvOS version on your real device under test (for example Xcode 11 for iOS 13, Xcode 12 for iOS 14, etc).
- Web views must be debuggable in order to test them. If it is not possible to connect to your web view(s) using [Safari remote debugger](https://appletoolbox.com/use-web-inspector-debug-mobile-safari/) then XCUITest won't be able to connect to them as well.
- Since version 3.33.0 (included into Appium 1.20.0+) of XCUITest driver the [Carthage](https://github.com/Carthage/Carthage) dependency *is not needed anymore*. Prior to that version it was required and could be installed using [brew](https://brew.sh/): `brew install carthage`.


## Optional dependencies

- [xcpretty](https://github.com/supermarin/xcpretty) tool could be used to make Xcode output easier to read. It could be installed using `gem install xcpretty` command.
- For test video recording we use [ffmpeg](https://ffmpeg.org/). It could be installed using [brew](https://brew.sh/): `brew install ffmpeg`
- [IDB](https://github.com/facebook/idb), [go-ios](https://github.com/danielpaulus/go-ios) and [tidevice](https://github.com/alibaba/taobao-iphone-device) could be used to improve some real device/Simulator interactions
- [WIX AppleSimulatorUtils](https://github.com/wix/AppleSimulatorUtils) could be used to improve some Simulator interactions
- [py-ios-device](https://github.com/YueChen-C/py-ios-device) is required in several `mobile:` extensions and to improve the general testing experience for _real_ iOS devices


## Xcode version support

Apple constantly works on various updates/improvements to XCTest framework. Thus, some major and even minor iOS releases might partially break the backward compatibility, so we need to implement multiple branches to support the legacy and the current implementations in [WebDriverAgent](https://github.com/appium/WebDriverAgent). Eventually we just drop the support of legacy XCTest implementations in order to simplify the client code and to have access to the recent platform features. The general aim is to support the _current major_ platform version and the _previous major_ one.

Minimum XCUITest driver version | Minimum required Xcode version
--- | ---
2.96.0 | Xcode 9
3.0.0 | Xcode 10
3.32.0 | Xcode 10.2
3.56.0 | Xcode 11
4.2.0 | Xcode 12
4.28.0 | Xcode 13

It could be that after a new Xcode SDK is released we figure out a part or even the whole functionality that [WebDriverAgent](https://github.com/appium/WebDriverAgent) currently provides does not work anymore and needs to be updated. The below table contains the driver versions mapping for the cases where we had known compatibility issues with newly released SDKs and addressed them. Basically, version numbers in this table mean that all XCUITest driver versions _below_ the one in the first column _won't support_ Xcode SDK equal or above the version in the second column and the only way to make your test working after Xcode update would be to also *bump the driver version*.

Minimum XCUITest driver version | Tested for compatibility with Xcode version
--- | ---
4.7.4 | Xcode 14-beta.3
4.21.7 | Xcode 14.3


## tvOS Support

Read the [tvOS support](ios-tvos.md) article to get more details on how to automate testing for this platform.


## Real devices

### Configuration

See the [real device configuration documentation](./real-device-config.md).

