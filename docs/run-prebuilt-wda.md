---
title: Run Prebuilt WebDriverAgentRunner
---


`xcodebuild` has arguments, `build-for-testing` and `test-without-building`.
Usually XCUITest driver runs both arguments in a new session creation to build the WebDriverAgentRunner application for testing, install it to a device and run it.

`build-for-testing` builds a test bundle package. `test-without-building` is to run it.

They can use separately as below:

```
xcodebuild build-for-testing \
  -project WebDriverAgent.xcodeproj \
  -derivedDataPath ~/wda_build \
  -scheme WebDriverAgentRunner \
  -destination "platform=iOS Simulator,name=iPhone 14 Pro" \
  CODE_SIGNING_ALLOWED=NO ARCHS=arm64
```

Then, the command generates files like below:

```
~/wda_build/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app
                          /WebDriverAgentRunner_iphonesimulator16.2-arm64.xctestrun
```

The file can be uses as below:

// todo: double check the command
```
xcodebuild test-without-building \
  -xctestrun ~/wda_build/Build/Products/
  -destination "platform=iOS Simulator,name=iPhone 14 Pro" \
```

Then, the `xcodebuild` command reuses the prebuilt `~/wda_build/Build/Products/` against the destination device without new building.
`http://localhost:8100` will be accessible during the command running.

XCUITest driver provides `useXctestrunFile` and `bootstrapPath` capabilities to achieve the `test-without-building` method.
It will improve WebDriverAgentRunner application setup performance.

This method can use both real devices and simulators, but the real device requires proper signing.
We would recommend [Run Preinstalled WebDriverAgentRunner](./run-preinstalled-wda.md) for real devices.

## `appium:useXctestrunFile` and `appium:bootstrapPath`


This way has existed long time.

```
{
  "appium:automationName": "xcuitest",
  "platformName": "ios",
  "appium:platformVersion": "15.5",
  "appium:useXctestrunFile": "true",
  "appium:bootstrapPath": "/Users/kazuaki/Downloads/artifact/Build/Products",
  "appium:deviceName": "iPhone 12"
}
```


## Prebuilt packages for simulators

You can find prebuilt packages in https://github.com/appium/WebDriverAgent/releases