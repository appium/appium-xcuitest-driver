---
title: Basic Examples of Session Capability Sets
---

This article describes necessary capabilities that must be provided in order
to implement some common automation testing scenarios.
It only describes very minimum sets of capabilities required to
be included. For refined setups more of them might need to be provided. Check the
[Capabilities](../reference/capabilities.md) article for more details
on each option available for the fine-tuning of XCUITest driver sessions.

### Application File (Real Device)

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:platformVersion": "<iOS_Version>",
  "appium:udid": "<Phone_UUID>",
  "appium:app": "/path/to/local/package.ipa"
}
```

`appium:app` could also be a remote app or an archive:

```
  "appium:app": "https://example.com/package.ipa"
  "appium:app": "https://example.com/package.zip"
```

`appium:udid` could also be set to `auto` in order to select the first matched device
connected to the host (or a single one if only one is connected):

```
  "appium:udid": "auto"
```

### Application File (Simulator)

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": "<Simulator_Name>",
  "appium:platformVersion": "<iOS_Version>",
  "appium:app": "/path/to/local/package.app"
}
```

`appium:app` could also be an archive:

```
  "appium:app": "https://example.com/package.zip"
  "appium:app": "/path/to/local/package.zip"
```

### Safari (Real Device)

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "browserName": "Safari",
  "appium:platformVersion": "<iOS_Version>",
  "appium:udid": "<Phone_UUID>"
}
```

You may also provide `appium:safariInitialUrl` capability value to navigate
to the desired page during the session startup:

```
  "appium:safariInitialUrl": "https://server.com/page"
```

### Safari (Simulator)

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "browserName": "Safari",
  "appium:deviceName": "<Simulator_Name>",
  "appium:platformVersion": "<iOS_Version>"
}
```

### Pre-Installed App (Real Device)

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:platformVersion": "<iOS_Version>",
  "appium:udid": "<Phone_UUID>",
  "appium:bundleId": "<Bundle_ID_Of_Preinstalled_App>",
  "appium:noReset": true
}
```

The `appium:noReset` capability is set to `true` in order to tell the driver
the app identified by `appium:bundleId` is already preinstalled and must not be reset.

### Pre-Installed App (Simulator)

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": "<Simulator_Name>",
  "appium:platformVersion": "<iOS_Version>",
  "appium:bundleId": "<Bundle_ID_Of_Preinstalled_App>",
  "appium:noReset": true
}
```

### Deeplink (Real Device running iOS 17+)

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:platformVersion": "<iOS_Version>",
  "appium:udid": "<Phone_UUID>",
  "appium:initialDeeplinkUrl": "<Deeplink_Url>"
}
```

### Deeplink (Simulator running iOS 17+)

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": "<Simulator_Name>",
  "appium:platformVersion": "<iOS_Version>",
  "appium:initialDeeplinkUrl": "<Deeplink_Url>"
}
```

### Custom Launch (Real Device)

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:platformVersion": "<iOS_Version>",
  "appium:udid": "<Phone_UUID>",
}
```

This will start your test at the Home screen.
Afterwards you may use any of the application management
methods, like [mobile: installApp](../reference//execute-methods.md#mobile-installapp)
or [mobile: activateApp](../reference//execute-methods.md#mobile-activateapp)
to manage the life cycle of your app or switch between contexts to
manage web pages. Check the full list of
[mobile: execute methods](../reference/execute-methods.md) for more details.

### Custom Launch (Simulator)

```json
{
  "platformName": "iOS",
  "appium:automationName": "XCUITest",
  "appium:deviceName": "<Simulator_Name>",
  "appium:platformVersion": "<iOS_Version>"
}
```
