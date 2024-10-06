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
