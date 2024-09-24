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
|`build-wda`|Builds the WebDriverAgent project using the first available iPhone simulator and the latest iOS supported by the current Xcode version by default. Params `--sdk` and `--name` to customize iOS version and the device - if not specified latest iOS and first available iPhone simulator|


```bash
appium driver run xcuitest build-wda --sdk=17.5 --name="iPhone 15"
```
