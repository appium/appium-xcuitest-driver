---
hide:
  - toc

title: Scripts
---

Appium drivers can include scripts for executing specific actions. The following table lists the
scripts bundled with the XCUITest driver. These scripts can be run as follows:

```
appium driver run xcuitest <script-name>
```

|Script Name|Description|
|------------|-----------|
|`open-wda`|Opens the WebDriverAgent project in Xcode|
|`build-wda`|Builds the WebDriverAgent project using the first available iPhone simulator and the latest iOS supported by the current Xcode version by default|
|`build-wda --sdk=17.5 --name="iPhone 15"`|Builds the WebDriverAgent project using the iPhone 15 simulator with iOS 17.5. If `--sdk` and `--name` params are not specified - the latest iOS and the first available iPhone simulator will be used|
|`tunnel-creation`|Creates tunnels for connected iOS devices, starts CoreDeviceProxy, and sets up a tunnel registry server. Requires sudo access to communicate with iOS devices|
|`tunnel-creation --udid=<device-udid>` or `-u <device-udid>`|Creates a tunnel for a specific iOS device with the given UDID|
|`tunnel-creation --packet-stream-base-port=<port>`|Specifies the base port for packet stream servers (default: 50000)|
|`tunnel-creation --tunnel-registry-port=<port>`|Specifies the port for the tunnel registry server (default: 42314)|
