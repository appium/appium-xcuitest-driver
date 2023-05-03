---
title: Run Preinstalled WebDriverAgentRunner
---

XCUITest driver can launch preinstalled WebDriverAgent directly against a real device.
It lets you start an XCUITest driver session without the `xcodebuild` command execution to improve the session start performance.

`appium:webDriverAgentUrl` helps to improve the session start performance as well, but the capability requires you to manage the WebDriverAgent-Runner on a device by yourself.
For exampel you should start the runner outside XCUITest driver before starting the a new session procedure.

## For Real Devices

### Capabilities

- Required
  - `appium:usePreinstalledWDA` to start a WebDriverAgent Runner-process without xcodebuild
- Optional
  - `appium:updatedWDABundleId` to customize the WebDriverAgent bundle id XCUITest driver launches

### Example steps with Xcode

1. Run WebDriverAgent with Xcode as test
2. Stop the Xcode session
3. Start a XCUITest driver session with the capabilities below:

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
@core.start_driver
```

If the `<udid>` device has a WebDriverAgent package with `com.appium.WebDriverAgentRunner.xctrunner` bundle id, the session will launch the WebDriverAgent process without xcodebuild.

> **Note**
> Please ensure that the WebDriverAgent-Runner application is launchable before starting a XCUITest driver session.
> For example, whether the provisioning profile is trusted by the system.

### Install WebDriverAgent

#### With Xcode

Running test of [WebDriveragent](https://github.com/appium/WebDriverAgent) package with Xcode is the easiest way to prepare the device environment.
Please read [Real Device Configuration tutorial](real-device-config.md) to configure the WebDriverAgent package for a real device.

If it is a non-paid account by `appium` user name, the bundle id would have `com.appium` prefix.
Then, the WebDriverAgent-Runner's bumdle id could be `com.appium.WebDriverAgentRunner` for example.
`appium:updatedWDABundleId` value should be `com.appium.WebDriverAgentRunner` then.
The test bundle by Xcode will be `com.appium.WebDriverAegnt.xctrunner`.

> **Note**
> Older than Xcode 11 has different naming convension. This feature does not work for a package which is built by Xcode 11 and lower versions.

> **Note**
> Please make sure that the installed `WebDriverAgentRunner-Runner` application is still launchable if the XCUITest driver session startup continued still fails by providing a correct WebDriverAgent bundle identifier.
> For example, non-paid account has limited period to keep the provisiong profile valid. Sometimes it is necessary to reinstall WebDriverAgentRunner-Runner once, or to restart the device.

#### With 3rd party tools

Some 3rd party tools such as [ios-deploy](https://github.com/ios-control/ios-deploy), [go-ios](https://github.com/danielpaulus/go-ios) and [tidevice](https://github.com/alibaba/taobao-iphone-device) can install the built WebDriverAgent package.

`WebDriverAgentRunner-Runner.app` package may exist in a `derivedDataPath` directory as explained in [Real Device Configuration tutorial](./real-device-config.md).
The `WebDriverAgentRunner-Runner.app` can be installed without xcodebuild with the 3rd party tools.
