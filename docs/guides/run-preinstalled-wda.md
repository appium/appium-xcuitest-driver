---
title: Run Preinstalled WebDriverAgentRunner
---

The XCUITest driver can be configured to launch an already-installed `WebDriverAgentRunner-Runner`
application (WDA) on a real device. This allows you to start a session without the `xcodebuild`
command execution, improving the session startup performance.

!!! warning

    iOS/tvOS 17+ speicic:

    This method currently works over `devicectl` for iOS 17+ with Xcode 15+ environment since XCUITest driver v7.5.0.
    This may not work for tvOS 17+.
    iOS/tvOS 16 and lower ones work over [appium-ios-device](https://github.com/appium/appium-ios-device) directly.

## Capabilities

- Required
    - [`appium:usePreinstalledWDA`](../reference/capabilities.md#webdriveragent)
- Optional
    - [`appium:updatedWDABundleId`](../reference/capabilities.md#webdriveragent)
    - [`appium:prebuiltWDAPath`](../reference/capabilities.md#webdriveragent)

## Install WebDriverAgent

### Using Xcode

Running a test for the WDA package in Xcode is the easiest way to prepare the device environment:

1. Open WebDriverAgent project in Xcode
    - You can run `appium driver run xcuitest open-wda` if using XCUITest driver 4.13 or newer
2. Select the _WebDriverAgentRunner_ scheme
3. Select the scheme as _Product -> Scheme -> WebDriverAgentRunner_ (or _WebDriverAgentRunner\_tvOS_ for tvOS)
4. Select your device in _Product -> Destination_
5. Select _Product -> Test_ to build and install the WDA app

If using a real device, you may need to change your bundle ID. Please check the
[Full Manual Provisioning Profile setup](../preparation/prov-profile-full-manual.md) for details.

### Using 3rd Party Tools

Some 3rd party tools such as [pymobiledevice3](https://github.com/doronz88/pymobiledevice3),
[ios-deploy](https://github.com/ios-control/ios-deploy), [go-ios](https://github.com/danielpaulus/go-ios) and
[tidevice](https://github.com/alibaba/taobao-iphone-device) can install the WebDriverAgent package.

The WDA app package (`WebDriverAgentRunner-Runner.app`) can be generated in the _derivedDataPath_
directory, as explained in [Manual Configuration for a Generic Device](../preparation/prov-profile-generic-manual.md).
The app can then be installed without `xcodebuild` using the 3rd party tools.


### Additional requirement for iOS 17+/tvOS17+

To launch the WebDriverAgentRunner package with `xcrun devicectl device process launch` it should not have `Frameworks/XC**` files.

For example, after building the WebDriverAgent with Xcode with proper sign, it generates `/Users/<user>/Library/Developer/Xcode/DerivedData/WebDriverAgent-ezumztihszjoxgacuhatrhxoklbh/Build/Products/Debug-appletvos/WebDriverAgentRunner-Runner.app`.
Then you can remove `Frameworks/XC**` in `WebDriverAgentRunner-Runner.app` like `rm Frameworks/WebDriverAgentRunner-Runner.app/XC**`.

Configuring `appium:prebuiltWDAPath` to the `/Users/<user>/Library/Developer/Xcode/DerivedData/WebDriverAgent-ezumztihszjoxgacuhatrhxoklbh/Build/Products/Debug-appletvos/WebDriverAgentRunner-Runner.app` would install the `WebDriverAgentRunner-Runner.app`, which has no `Frameworks/XC**` to the target device and launch it with `devicectl` command as part of `appium:usePreinstalledWDA` functionality.


## Launch the Session

After installing the `WebDriverAgentRunner-Runner` application, you can start the Appium server
and launch an XCUITest driver session with the specified capabilities:

```
appium
```

```ruby
# Ruby
capabilities: {
  "platformName": "ios",
  "appium:automationName": "xcuitest",
  "appium:udid": "<udid>",
  "appium:usePreinstalledWDA": true,
  "appium:updatedWDABundleId": "com.appium.WebDriverAgentRunner"
}
@core = Appium::Core.for capabilities: capabilities
driver = @core.start_driver
# do something
driver.quit
```

If the `<udid>` device has a WebDriverAgent package with `com.appium.WebDriverAgentRunner.xctrunner`
bundle ID, the session will launch the WebDriverAgent process without `xcodebuild`.

!!! note

    Please ensure that the WDA application is launchable before starting an XCUITest driver session.
    For example, check whether the provisioning profile is trusted.

## Set `appium:prebuiltWDAPath`

If the `appium:prebuiltWDAPath` capability is provided with a properly signed
`WebDriverAgentRunner-Runner.app` test bundle, the XCUITest driver will install the application and
launch it every test session. Test bundles cannot be versioned using `CFBundleVersion` as vanilla
applications do, which is why it is necessary to (re)install them for every test session.

Usually you can find the WDA application bundle at the below location if you use Xcode to build it.

```
~/Library/Developer/Xcode/DerivedData/WebDriverAgent-<random string>/Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app
```

You can then set your Appium capabilities as follows:

```ruby
# Ruby
capabilities: {
  "platformName": "ios",
  "appium:automationName": "xcuitest",
  "appium:udid": "<udid>",
  "appium:usePreinstalledWDA": true,
  "appium:prebuiltWDAPath": "/path/to/Library/Developer/Xcode/DerivedData/WebDriverAgent-<random string>/Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app"
}
@core = Appium::Core.for capabilities: capabilities
driver = @core.start_driver
# do something
driver.quit
```

!!! note

    As of iOS 17, the testmanagerd service name has changed from `com.apple.testmanagerd` to
    `com.apple.dt.testmanagerd.runner`. It causes an unexpected WDA process crash with embedded
    XCTest frameworks while running a single WebDriverAgent package on various OS environments
    without `xcodebuild`.

    Since WDA v5.10.0, the module can refer to the device's local XCTest frameworks. It lets the
    Appium/WebDriverAgent package use proper dependencies for the device with a single prebuilt
    WebDriverAgent package. To set this up, you should remove the package internal frameworks from
    `WebDriverAgentRunner-Runner.app` with `rm -rf WebDriverAgentRunner-Runner.app/Frameworks/XC*.framework`.
    The WDA package itself is available from <https://github.com/appium/WebDriverAgent>.
