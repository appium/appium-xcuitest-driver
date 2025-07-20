---
title: Run Prebuilt WebDriverAgentRunner
---

The XCUITest driver runs `xcodebuild` to build and install the WebDriverAgentRunner (WDA) app on the
target device. Running the command every time could slow down new session creation.
You can manually run a modified version of this command in order to prebuild the WDA.

## Understanding How `xcodebuild` Works

By default, `xcodebuild` is run with two commands: `build-for-testing` and `test-without-building`.
`build-for-testing` builds a test bundle package, whereas `test-without-building` actually runs it.

For instance, XCUITest driver issues an `xcodebuild` command like so:

```bash
xcodebuild build-for-testing test-without-building \
  -project WebDriverAgent.xcodeproj \
  -derivedDataPath wda_build \
  -scheme WebDriverAgentRunner \
  -destination "platform=iOS Simulator,name=iPhone 14 Pro" \
  CODE_SIGNING_ALLOWED=NO
```

This translates to `xcodebuild` building `WebDriverAgent.xcodeproj` and running the resulting
package on the specified device. `wda_build` path will have the built package.

The command can be split into `build-for-testing` and `test-without-building` parts as follows:

```bash
xcodebuild build-for-testing \
  -project WebDriverAgent.xcodeproj \
  -derivedDataPath wda_build \
  -scheme WebDriverAgentRunner \
  -destination "platform=iOS Simulator,name=iPhone 14 Pro" \
  CODE_SIGNING_ALLOWED=NO
```

```bash
xcodebuild test-without-building \
  -xctestrun wda_build/Build/Products/WebDriverAgentRunner_iphonesimulator16.2-arm64.xctestrun \
  -destination "platform=iOS Simulator,name=iPhone 14 Pro"
```

* The `build-for-testing` command generates two files: an `.app` package and an `.xctestrun` file, e.g.:

    ```
    wda_build/Build/Products/Debug-iphonesimulator/WebDriverAgentRunner-Runner.app
    wda_build/Build/Products/WebDriverAgentRunner_iphonesimulator16.2-arm64.xctestrun
    ```

    The `.xctestrun` file name depends on the `-destination` preference. The file contains metadata
    about the package (the `DependentProductPaths` key).

* The `test-without-building` command starts the WDA application for testing by referencing the
  provided `.xctestrun` file. Once this is done, `http://localhost:8100` will be able to receive
  commands for the target device.

## Preparation performance improvement ideas

### Download Prebuilt WDA and run them with `appium:prebuiltWDAPath` and `appium:usePreinstalledWDA`

This approach allows the XCUITest driver to start WDA without running `xcodebuild` by using prebuilt WDA packages.
We recommend this method if you don't need to modify the WDA source code.

[The Appium WebDriverAgent GitHub page](https://github.com/appium/WebDriverAgent/releases) provides
downloads for WebDriverAgent packages for real devices and simulators.
WebDriverAgent packages for real devices do not have embedded XCTest frameworks so that
they can run on iOS 17+ devices. Please read [Run Preinstalled WebDriverAgentRunner](./run-preinstalled-wda.md)
for more details. Understanding app signing is also important for real devices.
Simulators need everything, so WDA package sizes for simulators are greater than for real devices.
The [Release](https://github.com/appium/appium-xcuitest-driver/actions/workflows/publish.js.yml) and
[Building WebDriverAgent](https://github.com/appium/WebDriverAgent/actions/workflows/wda-package.yml)
workflows may help with validating the build script.

[Run Preinstalled WebDriverAgentRunner](./run-preinstalled-wda.md) provides `appium:prebuiltWDAPath`
and `appium:usePreinstalledWDA` capabilities.
These capabilities combination allows the XCUITest driver to install prebuilt WDA specified with
`appium:prebuiltWDAPath` and start it **without** `xcodebuild`.

The `download-wda-sim` command helps to download the proper version of WDA for your XCUITest driver version
for simulator use.

```bash
appium driver run xcuitest download-wda-sim --outdir=/path/to/target/directory
```

Then, starting a new session with capabilities below:

```json
{
  "appium:usePreinstalledWDA": true,
  "appium:prebuiltWDAPath": "/path/to/target/directory/WebDriverAgentRunner-Runner.app"
}
```

The new session starts without an `xcodebuild` run.

### Capabilities for Prebuilt WDA with `appium:useXctestrunFile`, `appium:usePrebuiltWDA` or `appium:prebuildWDA`

The XCUITest driver provides two capabilities that allow skipping the `build-for-testing` command,
and executing only the `test-without-building` command: __`appium:useXctestrunFile`__ and
__`appium:bootstrapPath`__ (see [Capabilities](../reference/capabilities.md#webdriveragent)).

!!! note

    These capabilities expect that the WDA files are already prebuild, so make sure to first run
    `xcodebuild` to create the files.

This method can be used on both real devices and simulators, but real devices requires proper
signing as described in [Run Preinstalled WebDriverAgentRunner](./run-preinstalled-wda.md).

The capabilities can be used as follows:

```json
{
  "platformName": "ios",
  "appium:automationName": "xcuitest",
  "appium:platformVersion": "18.4",
  "appium:deviceName": "iPhone 16",
  "appium:useXctestrunFile": true,
  "appium:bootstrapPath": "/path/to/wda_build/Build/Products"
}
```

Not all combinations have been tested, but the target device can probably be anything.

The same thing can be achieved with the __`appium:derivedDataPath`__ and __`appium:usePrebuiltWDA`__
capabilities, but this may fail if `xcodebuild` cannot find or handle the `.xctestrun` file
properly. The stability depends on Xcode.

__`appium:prebuildWDA`__ lets the XCUITest driver build the WDA before running it, then the session
will be handled with `appium:usePrebuiltWDA`.
It might have additional building steps than with `appium:derivedDataPath` and `appium:usePrebuiltWDA`
combination, but it could help `appium:usePrebuiltWDA` to not manage the WDA project.
