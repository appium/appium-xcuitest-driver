---
title: Run Preinstalled WebDriverAgentRunner
---

Appium XCUITest driver can launch preinstalled WebDriverAgent directly. It allows you to start an Appium session without `xcodebuild` command.
The benefit to not use `xcodebuild` every time is it could make the new session request faster.

> **Note**
> This method is for real devices.

## Capabilities

- Required
  - `appium:usePreinstalledWDA`
- Optional
  - `appium:preInstalledWDABundleId`

### Example

```json
{
  "platformName": "ios",
  "appium:automationName": "xcuitest",
  "appium:udid": "<udid>",
  "appium:usePreinstalledWDA": true,
  "appium:preInstalledWDABundleId": "io.appium.WebDriverAgentRunner.xctrunner"
}
```

Then, if the `<udid>` device has `io.appium.WebDriverAgentRunner.xctrunner` bundle id's WebDriverAgentRunner package, the session will launch the WebDriverAgentRunner process and use it.
Usually the session

> **Note**
> Please make sure the bundle id is launchable before starting an Appium session.
> For example if the provisioning profile is trusted by the system.

## Install WEbDriverAgent from Xcode


## Install via 3rd party tools
