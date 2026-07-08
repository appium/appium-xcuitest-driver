---
title: Non-macOS Hosts
---

The XCUITest driver has limited support for Windows and Linux host machines.

The key constraint for such sessions is the lack of Xcode and its related utilities. This brings
several limitations:

* Only real devices are supported (simulators can only be run on macOS)
* Real devices must be running iOS/tvOS 18 or later
* Automatic device selection is not supported
* The default `xcodebuild`-based WebDriverAgent (WDA) startup strategy is not supported

## Prerequisites

Device communication on non-macOS hosts is provided by the `appium-ios-remotexpc` optional
dependency. It will typically be automatically installed along with the XCUITest driver, but
otherwise make sure to install version `5.1.0` or later.

The package has its own prerequisites, which are described in [the RemoteXPC Tunnels guide](./remotexpc-tunnels-real-devices.md).

## Creating a Session

All Windows and Linux sessions must use several additional capabilities in order to avoid
Xcode-related codepaths.

Since automatic device selection is not supported, the device must be explicitly specified using
the [`appium:udid` and `appium:platformVersion` capabilities](../reference/capabilities.md).
Furthermore, since it is not possible to build WDA without Xcode, one of the following approaches
must be used:

* WDA can be already pre-installed on the device, which can be specified using the
  `appium:usePreinstalledWDA` capability - see [the Run Preinstalled WDA guide](./run-preinstalled-wda.md).
* WDA can be managed externally, which can be specified using the `appium:webDriverAgentUrl`
  capability - see [the Attach to a Running WDA guide](./attach-to-running-wda.md).

## Example Capability Sets

If using the pre-installed WDA approach:

```json
{
  "platformName": "ios",
  "appium:automationName": "xcuitest",
  "appium:platformVersion": "26.0",
  "appium:udid": "<device udid>",
  "appium:usePreinstalledWDA": true,
  "appium:updatedWDABundleId": "<updated bundle id>"
}
```

If using the externally managed WDA approach:

```json
{
  "platformName": "ios",
  "appium:automationName": "xcuitest",
  "appium:platformVersion": "26.0",
  "appium:udid": "<device udid>",
  "appium:webDriverAgentUrl": "http://<reachable ip address for the device>:8100"
}
```
