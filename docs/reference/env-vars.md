---
hide:
  - toc

title: Environment Variables
---

The driver recognizes several environment variables, which can be set when launching the Appium server.

For other environment variables recognized by the Appium server, see
[their Appium docs reference page](https://appium.io/docs/en/latest/reference/cli/env-vars/).

|<div style="width:17em">Variable Name</div>|Description|
|------------|-----------|
|`APPIUM_PREFER_SYSTEM_UNZIP`|Being set to either `0` or `false` makes the driver to use built-in Node.js unzipper rather than the system unzip utility. Mostly used for debugging purposes or troubleshooting as the system unzip utility is more performant in comparison to the built-in one.|
|`APPIUM_XCUITEST_PREFER_DEVICECTL`|Being set to `true`, `1` or `yes` makes the driver to use the devicectl Xcode utility to fetch the list of available devices UDIDs instead of the built-in usbmuxd client. Might be useful for some scenarios where the latter is unable to detect connected devices. See [PR #2194](https://github.com/appium/appium-xcuitest-driver/pull/2194) for more details.|
|`MJPEG_SCALING_FACTOR`|Overrides the default value for the `mjpegScalingFactor` setting when WebDriverAgent initializes the MJPEG screenshots broadcaster. Must be in range 1..100. This only affects the MJPEG stream and can still be changed later via the Settings API. See [MJPEG guide](../guides/mjpeg.md).|
|`MJPEG_SERVER_SCREENSHOT_QUALITY`|Overrides the default value for the `mjpegServerScreenshotQuality` setting when WebDriverAgent initializes the MJPEG screenshots broadcaster. Must be in range 1..100. This only affects the MJPEG stream and can still be changed later via the Settings API. See [MJPEG guide](../guides/mjpeg.md).|
