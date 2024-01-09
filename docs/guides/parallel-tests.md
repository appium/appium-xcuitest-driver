---
title: Testing in Parallel
---

It is possible to execute tests in parallel using XCUITest driver.
Appium allows to do this on per-process (multiple server processes running on different ports managing single session)
or per-request basis (single server process managing multiple sessions, more preferable, uses less resources and ensures better control over running sessions).

_Note_: If you are not going to run your tests in parallel then consider enabling the `--session-override` Appium server argument.
It forces the server to close all pending sessions before a new one could be opened,
which allows you to avoid possible issues with such sessions silently running/expiring in the background.

### Important Real Device Capabilities

- `udid` must be a unique device UDID for each parallel session.
- `wdaLocalPort` must be a unique port number for each parallel session. The default value is `8100`.
- `derivedDataPath` set the unique derived data path root for each driver instance. This will help to avoid possible conflicts and to speed up the parallel execution.
- `mjpegServerPort` must be a unique port number for each parallel session if you are going to record a video stream from it. The default value is `9100`.

### Important Simulator Capabilities

- Either `udid`, which is the unique simulator UDID for each parallel session (it could be retrieved from `xcrun simctl list` command output),
  or a unique combination of `deviceName` and `platformVersion` capabilities to identify the appropriate simulator with the given name and version number for each parallel session.
- `wdaLocalPort` must be a unique port number for each parallel session. The default value is `8100`.
- `derivedDataPath` set the unique derived data path root for each driver instance. This will help to avoid possible conflicts and to speed up the parallel execution.
- `mjpegServerPort` must be a unique port number for each parallel session if you are going to record a video stream from it. The default value is `9100`.

