---
title: Run Preinstalled WebDriverAgentRunner
---

XCUITest driver can launch preinstalled WebDriverAgent directly against a real device.
It lets you to start a XCUITest driver session without the `xcodebuild` command execution to improve the session startup performance.

## For Real Devices

### Capabilities

- Required
    - [`appium:usePreinstalledWDA`](capabilities.md#webdriveragent)
- Optional
    - [`appium:updatedWDABundleId`](capabilities.md#webdriveragent)
    - [`appium:prebuiltWDAPath`](capabilities.md#webdriveragent)

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

Please read [Real Device Configuration tutorial](real-device-config.md) to configure the WebDriverAgent package for a real device before the step 4.

If it is a non-paid account by `appium` user name, the bundle id would have `com.appium` prefix.
Then, the WebDriverAgent-Runner's bumdle id could be `com.appium.WebDriverAgentRunner` for example.
`appium:updatedWDABundleId` value should be `com.appium.WebDriverAgentRunner` then.
The test bundle by Xcode will be `com.appium.WebDriverAegnt.xctrunner`.

> **Note**
> Older than Xcode 11 has different naming convention. This feature does not work for a package which is built by Xcode versions below 12 have different naming conventions.

> **Note**
> Please make sure that the installed `WebDriverAgentRunner-Runner` application is still launchable if the XCUITest driver session startup still fails by providing a correct WebDriverAgent bundle identifier.
> For example, non-paid account has limited period to keep the provisiong profile valid. Sometimes it is necessary to reinstall WebDriverAgentRunner-Runner once, or to restart the device.

#### With 3rd party tools

Some 3rd party tools such as [ios-deploy](https://github.com/ios-control/ios-deploy), [go-ios](https://github.com/danielpaulus/go-ios) and [tidevice](https://github.com/alibaba/taobao-iphone-device) can install the built WebDriverAgent package.

`WebDriverAgentRunner-Runner.app` package may exist in a `derivedDataPath` directory as explained in [Real Device Configuration tutorial](./real-device-config.md).
The `WebDriverAgentRunner-Runner.app` can be installed without xcodebuild with the 3rd party tools.


### Set `appium:prebuiltWDAPath`

If `appium:prebuiltWDAPath` is provided with properly signed `WebDriverAgentRunner-Runner.app` test bundle (please check [Real Device Configuration tutorial](real-device-config.md)), XCUITest driver will install the application and launch it every session.
The test bundle cannot set the versioning as `CFBundleVersion`, thus the installation occurs every session.

The `.app` test bundle is generally generated as below if you built with Xcode.

```
~/Library/Developer/Xcode/DerivedData/WebDriverAgent-<random string>/Build/Products/Debug-iphoneos/WebDriverAgentRunner-Runner.app
```
