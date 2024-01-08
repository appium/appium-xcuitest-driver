---
title: Run Preinstalled WebDriverAgentRunner
---

XCUITest driver can launch preinstalled WebDriverAgent directly against a real device.
It lets you start a XCUITest driver session without the `xcodebuild` command execution to improve the session startup performance.

> **Note**
> This method does not work for iOS 17/tvOS 17 environment for now due to platform changes.
> Please use the `xcodebuild` method.

## For Real Devices

### Capabilities

- Required
    - [`appium:usePreinstalledWDA`](../reference/capabilities.md#webdriveragent)
- Optional
    - [`appium:updatedWDABundleId`](../reference/capabilities.md#webdriveragent)
    - [`appium:prebuiltWDAPath`](../reference/capabilities.md#webdriveragent)

### Example steps with Xcode

1. Run `WebDriverAgentRunner` scheme with Xcode as Test and stop it
    - Please read [Install WebDriverAgent With Xcode](#with-xcode) below
2. Start an Appium server process
3. Start a XCUITest driver session with the capabilities below:

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

If the `<udid>` device has a WebDriverAgent package with `com.appium.WebDriverAgentRunner.xctrunner` bundle id, the session will launch the WebDriverAgent process without xcodebuild.

> **Note**
> Please ensure that the WebDriverAgent-Runner application is launchable before starting a XCUITest driver session.
> For example, whether the provisioning profile is trusted by the system.

### Install WebDriverAgent

#### With Xcode

Running test of [WebDriveragent](https://github.com/appium/WebDriverAgent) package with Xcode is the easiest way to prepare the device environment.
The steps are:

1. Open WebDriverAgent project in Xcode
    - `appium driver run xcuitest open-wda` command after installing XCUITest driver may help
2. Select `WebDriverAgentRunner` scheme
    - `WebDriverAgentRunner_tvOS` for tvOS
4. Chose the target device
5. Run test via `Product` -> `Test` from the menu bar

Please read [Real Device Configuration tutorial](../preparation/real-device-config.md) to configure the WebDriverAgent package for a real device before the step 4.

If it is a non-paid account by `appium` user name, the bundle id would have `com.appium` prefix.
Then, the WebDriverAgent-Runner's bundle id could be `com.appium.WebDriverAgentRunner` for example.
`appium:updatedWDABundleId` value should be `com.appium.WebDriverAgentRunner` then.
The test bundle by Xcode will be `com.appium.WebDriverAegnt.xctrunner`.

> **Note**
> Versions of Xcode older than 11 have a different naming convention. This feature does not work for a package which is built by Xcode versions below 12.

> **Note**
> Please make sure that the installed `WebDriverAgentRunner-Runner` application is still launchable if the XCUITest driver session startup still fails by providing a correct WebDriverAgent bundle identifier.
> For example, non-paid account has limited period to keep the provisiong profile valid. Sometimes it is necessary to reinstall WebDriverAgentRunner-Runner once, or to restart the device.

#### With 3rd party tools

Some 3rd party tools such as [ios-deploy](https://github.com/ios-control/ios-deploy), [go-ios](https://github.com/danielpaulus/go-ios) and [tidevice](https://github.com/alibaba/taobao-iphone-device) can install the built WebDriverAgent package.

`WebDriverAgentRunner-Runner.app` package may exist in a `derivedDataPath` directory as explained in [Real Device Configuration tutorial](../preparation/real-device-config.md).
The `WebDriverAgentRunner-Runner.app` can be installed without xcodebuild with the 3rd party tools.


### Set `appium:prebuiltWDAPath`

If `appium:prebuiltWDAPath` is provided with a properly signed `WebDriverAgentRunner-Runner.app` test bundle (please check [Real Device Configuration tutorial](../preparation/real-device-config.md)), XCUITest driver will install the application and launch it every test session.
Test bundles cannot be versioned using `CFBundleVersion` as vanilla applications do. That is why it is necessary to (re)install them for every test session.

Usually you can find the actual WebDriverAgentRunner application bundle at the below location if you use Xcode to build it.

```
~/Library/Developer/Xcode/DerivedData/WebDriverAgent-<random string>/Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app
```

Then, the capabilities will be:

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

> **Note**
> As of iOS 17, the testmanagerd service name has changed to `com.apple.dt.testmanagerd.runner` from `com.apple.testmanagerd`.
> It causes an unexpected WDA process crash with embedded XCTest frameworks while running a single WebDriverAgent package on various OS environments without `xcodebuild`.
> Since appium-webdriveragent v5.10.0, the WDA module can refer to the device's local XCTtest frameworks.
> It lets the Appium/WebDriverAgent package use proper dependencies for the device with a single prebuilt WebDriverAgent package.
> To achieve the system reference, you should remove the package internal's frameworks as below from the `WebDriverAgentRunner-Runner.app`
> with `rm -rf WebDriverAgentRunner-Runner.app/Frameworks/XC*.framework`.
> The same package is available from https://github.com/appium/WebDriverAgent/releases
