---
hide:
  - toc

title: Environment Variables
---

This article describes environment variables that influence various XCUITest driver behaviors.

|<div style="width:17em">Variable Name</div>|Description|
|------------|-----------|
|`APPIUM_PREFER_SYSTEM_UNZIP`|Being set to either `0` or `false` makes the driver to use built-in Node.js unzipper rather than the system unzip utility. Mostly used for debugging purposes or troubleshooting as the system unzip utility is more performant in comparison to the built-in one.|
|`APPIUM_XCUITEST_PREFER_DEVICECTL`|Being set to `true`, `1` or `true` makes the driver to use the devicectl Xcode utility to fetch the list of available devices UDIDs instead of the built-in usbmuxd client. Might be useful for some scenarios where the latter is unable to detect connected devices. See [PR #2194](https://github.com/appium/appium-xcuitest-driver/pull/2194) for more details.|
