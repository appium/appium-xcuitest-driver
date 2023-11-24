---
title: Run Prebuilt WebDriverAgentRunner
---


`xcodebuild` has commands; `build-for-testing` and `test-without-building`.
`build-for-testing` builds a test bundle package. `test-without-building` is to run it.
Usually XCUITest driver runs both arguments in a new session creation to build the WebDriverAgentRunner application for testing, install it to a device and run it.

For instance, XCUITest driver issues a `xcodebuild` command like below:

```
xcodebuild build-for-testing test-without-building \
  -project WebDriverAgent.xcodeproj \
  -derivedDataPath wda_build \
  -scheme WebDriverAgentRunner \
  -destination "platform=iOS Simulator,name=iPhone 14 Pro" \
  CODE_SIGNING_ALLOWED=NO
```

Then, the `xcodebuild` command builds the `WebDriverAgent.xcodeproj` and starts the built package for testing.

The command can split for `build-for-testing` part and `test-without-building` part as below:

```
xcodebuild build-for-testing \
  -project WebDriverAgent.xcodeproj \
  -derivedDataPath wda_build \
  -scheme WebDriverAgentRunner \
  -destination "platform=iOS Simulator,name=iPhone 14 Pro" \
  CODE_SIGNING_ALLOWED=NO
```

```
xcodebuild test-without-building \
  -xctestrun wda_build/Build/Products/WebDriverAgentRunner_iphonesimulator16.2-arm64.xctestrun \
  -destination "platform=iOS Simulator,name=iPhone 14 Pro"
```

In the `build-for-testing` part, it generates `.app` package and `.xctestrun` file as below:

```
wda_build/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app
                        /WebDriverAgentRunner_iphonesimulator16.2-arm64.xctestrun
```

The `.xctestrun` file name depends on the `-destination` preference. The file has metadata about the package.

In the `test-without-building` part, it starts the WebDriverAgentRunner application for testing by referencing the given `.xctestrun`.
The file has `DependentProductPaths` key to manage dependencies for `WebDriverAgentRunner-Runner.app` built by the `build-for-testing` for example.

After succeeding in starting the WebDriverAgentRunner application for testing, `http://localhost:8100` will be accessible during the command running for _iPhone 14 Pro_ simulator.

XCUITest driver provides `useXctestrunFile` and `bootstrapPath` capabilities to conduct the `test-without-building` command only.
It will improve WebDriverAgentRunner application setup performance by skipping the `build-for-testing`.

This method can use both real devices and simulators, but the real device requires proper signing as [Run Preinstalled WebDriverAgentRunner](./run-preinstalled-wda.md).

We would recommend to use `useXctestrunFile` for real devices since the above `test-without-building` needs to install the WebDriverAgentRunner package every session creation but the `useXctestrunFile` does not.

## How to use `appium:useXctestrunFile` and `appium:bootstrapPath` capabilities

Based on the above case, the usage of `useXctestrunFile` and `bootstrapPath` will be:

```json
{
  "platformName": "ios",
  "appium:automationName": "xcuitest",
  "appium:platformVersion": "15.5",
  "appium:deviceName": "iPhone 12",
  "appium:useXctestrunFile": true,
  "appium:bootstrapPath": "/path/to/wda_build/Build/Products"
}
```

We haven't tested all possible combinations, but probably the target device could be anything.

The same thing could achieve with `derivedDataPath` and `usePrebuiltWDA` capabilities, but it may fail if the `xcodebuild` cannot find or handle the `.xctestrun` properly.
The stability depends on Xcode.

## Download prebuilt WebDriverAgent from GitHub appium/WebDriverAgent repository

[GitHub releases](https://github.com/appium/WebDriverAgent/releases) lets you get each WebDriverAgent package for real devices.
They do not have embedded XCTest frameworks.

[Release](https://github.com/appium/appium-xcuitest-driver/actions/workflows/publish.js.yml) and [Building WebDriverAgent](https://github.com/appium/WebDriverAgent/actions/workflows/wda-package.yml) workflows help to check the script to build them.
