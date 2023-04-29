---
title: Run Preinstalled WebDriverAgentRunner
---

Appium XCUITest driver can launch preinstalled WebDriverAgent directly. It allows you to run `xcodebuild` command entirely.

> **Note**
> This method is for real devices.

## Capabilities

1. `appium:usePreinstalledWDA` + `appium:preInstalledWDABundleId`
2. `appium:webDriverAgentUrl` + manage WDA process by yourselves


## `appium:usePreinstalledWDA` + `appium:preInstalledWDABundleId`

```json
{
  "platformName": "ios",
  "appium:automationName": "xcuitest",
  "appium:udid": "<udid>",
  "appium:usePreinstalledWDA": true,
  "appium:preInstalledWDABundleId": "io.appium.WebDriverAgentRunner.xctrunner"
}
```

Then, if the `<udid>` device has `io.appium.WebDriverAgentRunner.xctrunner` bundle id's WebDriverAgentRunner package, the session will launch the process and use the WebDriverAgentRunner process.
It will improve the test preparation speed significantly as same as `appium:webDriverAgentUrl`.

> **Note**
> Please make sure the bundle id is launchable before starting an Appium session.
> For example if the provisioning profile is trusted by the system.
