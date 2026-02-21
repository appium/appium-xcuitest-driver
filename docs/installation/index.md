---
hide:
  - navigation

title: Installation
---

Like all Appium drivers, the XCUITest driver requires Appium to be installed. Refer to the
[Appium documentation](https://appium.io/docs/en/latest/quickstart/install/) for its requirements
and prerequisites.

!!! info

    XCUITest driver `10.0.0` or later requires Appium 3, and no longer supports Appium 2. For more
    details, refer to the [Appium Server Support](#appium-server-support) section.

## Install the Driver

Once Appium has been installed, you can use the [extension CLI](https://appium.io/docs/en/latest/cli/extensions/)
to install the XCUITest driver:

```bash
appium driver install xcuitest
```

Alternatively, if you are running a Node.js project, you can include `appium-xcuitest-driver` as
one of your project dependencies. [Refer to the Appium documentation](https://appium.io/docs/en/latest/guides/managing-exts/#do-it-yourself-with-npm)
for more information about this approach.

## Load the Driver

To activate the driver, simply launch the Appium server. By default, Appium will load all the
installed drivers:

```bash
appium
```

The server log output should include a line like the following:

```
[Appium] XCUITestDriver has been successfully loaded in 0.789s
```

Once the driver has been loaded, you can continue with [device preparation](../preparation/index.md).

## System Requirements

!!! note

    Many of the below requirements can be validated after installing the driver, via the built-in
    Appium Doctor support:
    ```
    appium driver doctor xcuitest
    ```

- macOS host platform
- Xcode and Xcode Developer Tools
    - Make sure to install an Xcode version that supports the iOS/iPadOS/tvOS version you want to test.
      Different Xcode versions also have different macOS host version requirements. For more details,
      refer to the [Xcode Release Notes](https://developer.apple.com/documentation/xcode-release-notes/).
    - New major Xcode versions (especially beta) will likely require you to also update the driver. See the
      [iOS Version Support](#ios-version-support) section for details.
- If automating real devices, additional manual configuration is required - please refer to the
  [Real Device Configuration](../preparation/real-device-config.md) guide.
- If testing web or hybrid apps, their webviews must be debuggable. If it is not possible to connect to your
  webview(s) using [Safari remote debugger](https://appletoolbox.com/use-web-inspector-debug-mobile-safari/),
  then the driver will not be able to identify them.

### Optional Requirements

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

## Appium Server Support

If you are running an older version of Appium, make sure to install a supported driver version:

| Appium server version | Supported XCUITest driver versions |
| --- | --- |
| Appium 3 | `>= 10.0.0` |
| Appium 2 | `4.0.0 - 9.10.5` |
| Appium 1 | `<= 3.62.0` (bundled with Appium) |

## iOS Version Support

The driver/WDA aims to support the latest _two_ (2) major Xcode/iOS/iPadOS/tvOS versions. Use the
following tables to decide which driver version to install. Older Xcode/OS versions with the
'maintenance' label are still likely to work fine with the latest driver, but any fixes for them
will have lesser priority than for newer Xcode/OS versions, and any major workarounds are unlikely. 

If you are upgrading/downgrading an existing driver installation to adjust its Xcode/OS support
range, ensure that the [WebDriverAgent (WDA)](https://github.com/appium/WebDriverAgent)
version on the device under test is also updated accordingly.

??? info "Why not support all iOS versions?"

    The XCUITest driver depends on the [WebDriverAgent (WDA)](https://github.com/appium/WebDriverAgent)
    framework, which in turn [relies on Apple's XCTest framework](../overview.md). Changes in the
    XCTest API are published in new Xcode and Apple device OS versions. These API changes may not
    only add new features that the driver must implement in order to support the latest devices, but
    also modify or even remove support for existing features that the driver relies on.

!!! note

    For iOS/tvOS/Xcode support in driver/WDA versions older than `4.0.0` (Appium 1), please refer to
    [the Appium 1 changelog](https://github.com/appium/appium/blob/1.x/CHANGELOG.md).

The following table maps Xcode versions to their supported driver/WDA versions:

| Xcode version | First supported driver version | Last supported driver version |
| --- | --- | -- |
| Xcode 26 | `9.5.0` (WDA `9.14.1`) | Latest |
| Xcode 16 | `7.24.15` (WDA `8.9.1`) | Latest |
| Xcode 15 | `4.32.23` (WDA `5.6.0`) | Latest (maintenance) |
| Xcode 14.3 | `4.21.7` (WDA `4.13.1`) | Latest (maintenance) |
| Xcode 14.0 - 14.2 | `4.7.4` (WDA `4.8.1`) | Latest (maintenance) |
| Xcode 13 | Pre-`4.0.0` | `10.6.0` (WDA `10.2.2`) |
| Xcode 12 | Pre-`4.0.0` | `4.27.2` (WDA `4.15.1`) |
| Xcode 11 | Pre-`4.0.0` | `4.2.0` (WDA `4.0.0`) |

The following table maps iOS versions to their supported driver/WDA versions:

| iOS version | First supported driver version | Last supported driver version |
| --- | --- | -- |
| iOS 26.4 | `10.23.2` (WDA `11.1.5`) | Latest |
| iOS 26.0 - 26.3 | `9.5.0` (WDA `9.14.1`) | Latest |
| iOS 18 | `7.24.15` (WDA `8.9.1`) | Latest |
| iOS 17 | `4.32.23` (WDA `5.6.0`) | Latest (maintenance) |
| iOS 16.4 | `4.21.7` (WDA `4.13.1`) | Latest (maintenance) |
| iOS 16.0 - 16.3 | `4.7.4` (WDA `4.8.1`) | Latest (maintenance) |
| iOS 15 | Pre-`4.0.0` | Latest (maintenance) |
| iOS 9.3 - 14 | Pre-`4.0.0` | `4.27.2` (WDA `4.15.1`) |
