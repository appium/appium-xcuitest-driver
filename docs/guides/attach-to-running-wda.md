---
title: Attach to a running WebDriverAgent application
---

XCUITest driver provides `appium:webDriverAgentUrl` capability to attach to a running WebDriverAgent application.
This works for real devices and simulators, but primary usage is for real devices.

## How to use `appium:webDriverAgentUrl` capability

1. Start a WebDriverAgent application on a device
2. Start an XCUITest driver session with `appium:webDriverAgentUrl` capability

Please read [Manage WebDriverAgent by yourself](./wda-custom-server.md) and [Real Device Configuration](../preparation/real-device-config.md) about how to prepare a WebDriverAgent application for real devices and start it.

The `appium:webDriverAgentUrl` should be `http://<reachable ip address for the device>:8100`.
If the environment had port-forward to the connected device, it can be `http://localhost:8100`.


```json
{
  "platformName": "ios",
  "appium:automationName": "xcuitest",
  "appium:platformVersion": "15.5",
  "appium:udid": "<the device's udid>",
  "appium:deviceName": "iPhone",
  "appium:webDriverAgentUrl": "http://<reachable ip address for the device>:8100"
}
```

This method allows you to manage the WebDriverAgent application process by yourself.
XCUITest driver simply attaches to the WebDriverAgent application process.
It may improve the application performance.

Some xcuitest driver APIs (for example the [mobile: calibrateWebToRealCoordinatesTranslation](../reference/execute-methods.md#mobile-calibratewebtorealcoordinatestranslation) one) might still require to know
the port number of the remote device if it is a real device. Providing
`webDriverAgentUrl` capability might not be sufficient to recognize the remote port number in case it is different from the local one. Consider settings the `appium:wdaRemotePort` capability value
in such case to supply the driver with the appropriate data.
