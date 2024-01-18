---
hide:
  - toc

title: Attach to a Running WebDriverAgent
---

The XCUITest driver provides the __`appium:webDriverAgentUrl`__ capability to attach to a running
WebDriverAgent (WDA) application. This works for real devices and simulators, but the primary usage
is for real devices.

## Usage

1. Start a WebDriverAgent application on a device
2. Start an XCUITest driver session with `appium:webDriverAgentUrl` capability

Please read [Manage WebDriverAgent by Yourself](./wda-custom-server.md) and
[Real Device Configuration](../preparation/real-device-config.md) about how to prepare WDA for a
real device.

The `appium:webDriverAgentUrl` value should be the WDA URL: `http://<reachable ip address for the device>:8100`.
If the environment has port-forward to the connected device, it can be `http://localhost:8100`.

```json
{
  "platformName": "ios",
  "appium:automationName": "xcuitest",
  "appium:platformVersion": "15.5",
  "appium:udid": "<device udid>",
  "appium:deviceName": "iPhone",
  "appium:webDriverAgentUrl": "http://<reachable ip address for the device>:8100"
}
```

This method allows you to manage the WDA process by yourself. The XCUITest driver then simply
attaches to the WDA process, which may improve the application performance.

Some XCUITest driver APIs (for example,
[mobile: calibrateWebToRealCoordinatesTranslation](../reference/execute-methods.md#mobile-calibratewebtorealcoordinatestranslation))
might still require the port number of the remote device if it is a real device. Providing the
`appium:webDriverAgentUrl` capability might not be sufficient to recognize the remote port number,
in case it is different from the local one. Consider settings the `appium:wdaRemotePort` capability
in such cases, to supply the driver with the appropriate data.
