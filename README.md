# appium-xcuitest-driver

[![NPM version](http://img.shields.io/npm/v/appium-xcuitest-driver.svg)](https://npmjs.org/package/appium-xcuitest-driver)
[![Downloads](http://img.shields.io/npm/dm/appium-xcuitest-driver.svg)](https://npmjs.org/package/appium-xcuitest-driver)
[![Dependency Status](https://david-dm.org/appium/appium-xcuitest-driver.svg)](https://david-dm.org/appium/appium-xcuitest-driver)
[![devDependency Status](https://david-dm.org/appium/appium-xcuitest-driver/dev-status.svg)](https://david-dm.org/appium/appium-xcuitest-driver#info=devDependencies)

[![Build Status](https://api.travis-ci.org/appium/appium-xcuitest-driver.png?branch=master)](https://travis-ci.org/appium/appium-xcuitest-driver)
[![Coverage Status](https://coveralls.io/repos/appium/appium-xcuitest-driver/badge.svg?branch=master)](https://coveralls.io/r/appium/appium-xcuitest-driver?branch=master)
[![Greenkeeper badge](https://badges.greenkeeper.io/appium/appium-xcuitest-driver.svg)](https://greenkeeper.io/)

*Note*: Issue tracking for this repo has been disabled. Please use the [main Appium issue tracker](https://github.com/appium/appium/issues) instead.


## Known issues

* `shake` is implemented via AppleScript and works only on Simulator due to lack of support from Apple
* Through multi action API, `zoom` works but `pinch` does not, due to Apple issue.


## External dependencies

In addition to the git submodules mentioned below (see [Development](#development)), this package currently depends
on `libimobiledevice` to do certain things. Install it with [Homebrew](http://brew.sh/),

```
brew install libimobiledevice --HEAD  # install from HEAD to get important updates
```

There is also a dependency, made necessary by Facebook's [WebDriverAgent](https://github.com/facebook/WebDriverAgent),
for the [Carthage](https://github.com/Carthage/Carthage) dependency manager. If you
do not have Carthage on your system, it can also be installed with
[Homebrew](http://brew.sh/)

```
brew install carthage
```

```
npm install -g ios-deploy
```

For real devices we can use [xcpretty](https://github.com/supermarin/xcpretty) to make Xcode output more reasonable. This can be installed by

```
gem install xcpretty
```

### Before module version 2.96.0 WebDriverAgent component only supports XCode8 and newer
### Since module version 2.96.0 WebDriverAgent component only supports XCode9 and newer


## Sim Resetting

By default, this driver will create a new iOS simulator and run tests on it, deleting the simulator afterward.

If you specify a specific simulator using the `udid` capability, this driver will boot the specified simulator and shut it down afterwards.

If a udid is provided and the simulator is already running, this driver will leave it running after the test run.

In short, this driver tries to leave things as it found them.

You can use the `noReset` capability to adjust this behavior.
Setting `noReset` to `true` will leave the simulator running at the end of a test session.


## Real devices

### Configuration

See [real device configuration documentation](docs/real-device-config.md).

### Known problems

After many failures on real devices, there can be a state where the device will no longer accept connections. To possibly remedy this reboot the device. Read https://github.com/facebook/WebDriverAgent/issues/507 for more details. [Getting full control](https://github.com/appium/appium/blob/master/docs/en/advanced-concepts/wda-custom-server.md) over WDA server might help to workaround the problem.

#### Weird state

**Note:** Running WebDriverAgent tests on a real device is particularly flakey. If things stop responding, the only recourse is, most often, to restart the device. Logs in the form of the following _may_ start to occur:

```shell
info JSONWP Proxy Proxying [POST /session] to [POST http://10.35.4.122:8100/session] with body: {"desiredCapabilities":{"ap..."
dbug WebDriverAgent Device: Jul 26 13:20:42 iamPhone XCTRunner[240] <Warning>: Listening on USB
dbug WebDriverAgent Device: Jul 26 13:21:42 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - Unable to update application state promptly. <unknown> 0 1
dbug WebDriverAgent Device: Jul 26 13:21:57 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - Failed to get screenshot within 15s <unknown> 0 1
dbug WebDriverAgent Device: Jul 26 13:22:57 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - App state of (null) is still unknown <unknown> 0 1
```

### Real device security settings

On some systems there are Accessibility restrictions that make the `WebDriverAgent` system unable to run. This is usually manifest
by `xcodebuild` returning an error code `65`. A workaround for this is to use a private key that is not stored on the system
keychain. See [this issue](https://github.com/appium/appium/issues/6955) and [this Stack Exchange post](http://stackoverflow.com/questions/16550594/jenkins-xcode-build-works-codesign-fails).

To export the key, use

```
security create-keychain -p [keychain_password] MyKeychain.keychain
security import MyPrivateKey.p12 -t agg -k MyKeychain.keychain -P [p12_Password] -A
```

where `MyPrivateKey.p12` is the private development key exported from the system keychain.

The full path to the keychain can then be sent to the Appium system using the `keychainPath` desired capability,
and the password sent through the `keychainPassword` capability.

## Desired Capabilities

Should be the same for [Appium](https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/caps.md)

Differences are noted here:

### [WebDriverAgent](https://github.com/appium/WebDriverAgent) build and run capabilities:

|Capability|Description|Values|
|----------|-----------|------|
|`xcodeOrgId`|Apple developer team identifier string. Must be used in conjunction with `xcodeSigningId` to take effect.|e.g., `JWL241K123`|
|`xcodeSigningId`|String representing a signing certificate. Must be used in conjunction with `xcodeOrgId`. This is usually just `iPhone Developer`, so the default (if not included) is `iPhone Developer`|e.g., `iPhone Developer`|
|`xcodeConfigFile`|Full path to an optional Xcode configuration file that specifies the code signing identity and team for running the WebDriverAgent on the real device.|e.g., `/path/to/myconfig.xcconfig`|
|`updatedWDABundleId`|Bundle id to update WDA to before building and launching on real devices. This bundle id _must_ be associated with a valid provisioning profile.|e.g., `io.appium.WebDriverAgentRunner`|
|`keychainPath`|Full path to the private development key exported from the system keychain. Used in conjunction with `keychainPassword` when testing on real devices.|e.g., `/path/to/MyPrivateKey.p12`|
|`keychainPassword`|Password for unlocking keychain specified in `keychainPath`.|e.g., `super awesome password`|
|`derivedDataPath`| Use along with *usePrebuiltWDA* capability and choose where to search for the existing WDA app. If the capability is not set then Xcode will store the derived data in the default root taken from preferences.|
|`webDriverAgentUrl`|If provided, Appium will connect to an existing WebDriverAgent instance at this URL instead of starting a new one.|e.g., `http://localhost:8100`|
|`useNewWDA`|If `true`, forces uninstall of any existing WebDriverAgent app on device. Set it to `true` if you want to apply different startup options for WebDriverAgent for each session. Although, it is only guaranteed to work stable on Simulator. Real devices require WebDriverAgent client to run for as long as possible without reinstall/restart to avoid issues like https://github.com/facebook/WebDriverAgent/issues/507. The `false` value (the default behaviour since driver version 2.35.0) will try to detect currently running WDA listener executed by previous testing session(s) and reuse it if possible, which is highly recommended for real device testing and to speed up suites of multiple tests in general. A new WDA session will be triggered at the default URL (http://localhost:8100) if WDA is not listening and `webDriverAgentUrl` capability is not set. The negative/unset value of `useNewWDA` capability has no effect prior to xcuitest driver version 2.35.0.|e.g., `true`|
|`wdaLaunchTimeout`|Time, in ms, to wait for WebDriverAgent to be pingable. Defaults to 60000ms.|e.g., `30000`|
|`wdaConnectionTimeout`|Timeout, in ms, for waiting for a response from WebDriverAgent. Defaults to 240000ms.|e.g., `1000`|
|`wdaStartupRetries`|Number of times to try to build and launch WebDriverAgent onto the device. Defaults to 2.|e.g., `4`|
|`wdaStartupRetryInterval`|Time, in ms, to wait between tries to build and launch WebDriverAgent. Defaults to 10000ms.|e.g., `20000`|
|`wdaLocalPort`|This value if specified, will be used to forward traffic from Mac host to real ios devices over USB. Default value is same as port number used by WDA on device.|e.g., `8100`|
|`wdaBaseUrl`| This value if specified, will be used as a prefix to build a custom WebDriverAgent url. It is different from `webDriverAgentUrl`, because if the latter is set then it expects WebDriverAgent to be already listening and skips the building phase. Defaults to `http://localhost` | e.g., `http://192.168.1.100`|
|`showXcodeLog`|Whether to display the output of the Xcode command used to run the tests. If this is `true`, there will be **lots** of extra logging at startup. Defaults to `false`|e.g., `true`|
|`iosInstallPause`|Time in milliseconds to pause between installing the application and starting WebDriverAgent on the device. Used particularly for larger applications. Defaults to `0`|e.g., `8000`|
|`usePrebuiltWDA`|Skips the build phase of running the WDA app. Building is then the responsibility of the user. Only works for Xcode 8+. Defaults to `false`.|e.g., `true`|
|`useCarthageSsl`|Use SSL to download dependencies for WebDriverAgent. Defaults to `true`| `true`, `false` |
|`shouldUseSingletonTestManager`|Use default proxy for test management within WebDriverAgent. Setting this to `false` sometimes helps with socket hangup problems. Defaults to `true`.|e.g., `false`|
|`useXctestrunFile`|Use Xctestrun file to launch WDA. It will search for such file in `bootstrapPath`. Expected name of file is `WebDriverAgentRunner_iphoneos<sdkVersion>-arm64.xctestrun` for real device and `WebDriverAgentRunner_iphonesimulator<sdkVersion>-x86_64.xctestrun` for simulator. One can do `build-for-testing` for `WebDriverAgent` project for simulator and real device and then you will see [Product Folder like this](docs/useXctestrunFile.png) and you need to copy content of this folder at `bootstrapPath` location. Since this capability expects that you have already built `WDA` project, it neither checks whether you have necessary dependencies to build `WDA` nor will it try to build project. Defaults to `false`. _Tips: `Xcodebuild` builds for the target platform version. We'd recommend you to build with minimal OS version which you'd like to run as the original WDA module. e.g. If you build WDA for 12.2, the module cannot run on iOS 11.4 because of loading some module error on simulator. A module built with 11.4 can work on iOS 12.2. (This is xcodebuild's expected behaviour.)_ |e.g., `true`|
|`useSimpleBuildTest`| Build with `build` and run test with `test` in xcodebuild for all Xcode version if this is `true`, or build with `build-for-testing` and run tests with `test-without-building` for over Xcode 8 if this is `false`. Defaults to `false`. | `true` or `false` |
|`wdaEventloopIdleDelay`|Delays the invocation of `-[XCUIApplicationProcess setEventLoopHasIdled:]` by the number of seconds specified with this capability. This can help quiescence apps that fail to do so for no obvious reason (and creating a session fails for that reason). This increases the time for session creation because `-[XCUIApplicationProcess setEventLoopHasIdled:]` is called multiple times. If you enable this capability start with at least `3` seconds and try increasing it, if creating the session still fails. Defaults to `0`. |e.g. `5`|
|`processArguments`|Process arguments and environment which will be sent to the WebDriverAgent server.|`{ args: ["a", "b", "c"] , env: { "a": "b", "c": "d" } }` or `'{"args": ["a", "b", "c"], "env": { "a": "b", "c": "d" }}'`|
|`autoLaunch`|When set to `false`, prevents the application under test from being launched automatically as a part of the new session startup process. The launch become the responsibility of the user. Defaults to `true`.|`true` or `false`|

### Simulator control capabilities:

|Capability|Description|Values|
|----------|-----------|------|
|`scaleFactor`|Simulator scale factor. This is useful to have if the default resolution of simulated device is greater than the actual display resolution. So you can scale the simulator to see the whole device screen without scrolling.|Acceptable values for simulators running Xcode SDK 8 and older are: `'1.0', '0.75', '0.5', '0.33' and '0.25'`, where '1.0' means 100% scale. For simulators running Xcode SDK 9 and above the value could be any valid positive float number. The capability must be of a string type.|
|`connectHardwareKeyboard`|Set this option to `true` in order to enable hardware keyboard in Simulator. It is set to `false` by default, because this helps to workaround some XCTest bugs.|`true` or `false`|
|`calendarAccessAuthorized`|Set this to `true` if you want to enable calendar access on IOS Simulator with given bundleId. Set to `false`, if you want to disable calendar access on IOS Simulator with given bundleId. If not set, the calendar authorization status will not be set.|e.g., `true`|
|`isHeadless`|Set this capability to `true` if automated tests are running on Simulator and the device display is not needed to be visible. This only has an effect since Xcode9 and only for simulators. All running instances of Simulator UI are going to be automatically terminated if headless test is started. `false` is the default value.|e.g., `true`|
|`simulatorWindowCenter`|Allows to explicitly set the coordinates of Simulator window center for Xcode9+ SDK. This capability only has an effect if Simulator window has not been opened yet for the current session before it started.|e.g. `{-100.0,100.0}` or `{500,500}`, spaces are not allowed|
|`shutdownOtherSimulators`|If this capability set to `true` and the current device under test is an iOS Simulator then Appium will try to shutdown all the other running Simulators before to start a new session. This might be useful while executing webview tests on different devices, since only one device can be debugged remotely at once due to an Apple bug. The capability only has an effect if `--relaxed-security` command line argument is provided to the server. Defaults to `false`.|e.g. `true`|
| `enforceFreshSimulatorCreation`| Creates a new simulator in session creation and deletes it in session deletion. Defaults to `false`. | `true` or `false` |
|`keepKeyChains`|Set the capability to `true` in order to preserve Simulator keychains folder after full reset. This feature has no effect on real devices. Defaults to `false`|e.g. `true`|
|`keychainsExcludePatterns`|This capability accepts comma-separated path patterns, which are going to be excluded from keychains restore while full reset is being performed on Simulator. It might be useful if you want to exclude only particular keychain types from being restored, like the applications keychain. This feature has no effect on real devices.|e.g. `*keychain*.db*` to exclude applications keychain from being restored|
|`reduceMotion`| It allows to turn on/off reduce motion accessibility preference. Setting reduceMotion `on` helps to reduce flakiness during tests. Only on simulators | e.g `true` |
|`permissions`| Allows to set permissions for the specified application bundle on Simulator only. The capability value is expected to be a valid JSON string with `{"<bundleId1>": {"<serviceName1>": "<serviceStatus1>", ...}, ...}` format. It is required that `applesimutils` package is installed and available in PATH. The list of available service names and statuses can be found at https://github.com/wix/AppleSimulatorUtils. | e. g. `{"com.apple.mobilecal": {"calendar": "YES"}}` |


### General capabilities:

|Capability|Description|Values|
|----------|-----------|------|
|`resetOnSessionStartOnly`|Whether to perform reset on test session finish (`false`) or not (`true`). Keeping this variable set to `true` and Simulator running (the default behaviour since version 1.6.4) may significantly shorten the duratiuon of test session initialization.|Either `true` or `false`. Defaults to `true`|
|`commandTimeouts`|Custom timeout(s) in milliseconds for WDA backend commands execution. This might be useful if WDA backend freezes unexpectedly or requires too much time to fail and blocks automated test execution. The value is expected to be of type string and can either contain max milliseconds to wait for each WDA command to be executed before terminating the session forcefully or a valid JSON string, where keys are internal Appium command names (you can find these in logs, look for "Executing command 'command_name'" records) and values are timeouts in milliseconds. You can also set the 'default' key to assign the timeout for all other commands not explicitly enumerated as JSON keys.|`'120000'`, `'{"findElement": 40000, "findElements": 40000, "setValue": 20000, "default": 120000}'`|
|`maxTypingFrequency`|Maximum frequency of keystrokes for typing and clear. If your tests are failing because of typing errors, you may want to adjust this. Defaults to 60 keystrokes per minute.|e.g., `30`|
|`simpleIsVisibleCheck`|Use native methods for determining visibility of elements. In some cases this takes a long time. Setting this capability to `false` will cause the system to use the position and size of elements to make sure they are visible on the screen. This can, however, lead to false results in some situations. Defaults to `false`, except iOS 9.3, where it defaults to `true`.|e.g., `true`, `false`|
|`absoluteWebLocations`|This capability will direct the `Get Element Location` command, when used within webviews, to return coordinates which are relative to the origin of the page, rather than relative to the current scroll offset. This capability has no effect outside of webviews. Default `false`.|e.g., `true`|
|`useJSONSource`|Get JSON source from WDA and parse into XML on Appium server. This can be much faster, especially on large devices. Defaults to `false`.|e.g., `true`|
|`mjpegServerPort`|The port number on which WDA broadcasts screenshots stream encoded into MJPEG format from the device under test. It might be necessary to change this value if the default port is busy because of other tests running in parallel. Default value: `9100`|e.g. `12000`|
|`waitForQuiescence`| It allows to turn on/off waiting for application quiescence in WebDriverAgent, while performing queries. The default value is `true`. You can avoid [this kind of issues](https://github.com/appium/appium/issues/11132) if you turn it off. |e.g `false`|
|`screenshotQuality`| Changes the quality of phone display screenshots following [xctest/xctimagequality](https://developer.apple.com/documentation/xctest/xctimagequality?language=objc)  Default value is `1`. `0` is the highest and `2` is the lowest quality. You can also change it via [settings](https://github.com/appium/appium/blob/master/docs/en/advanced-concepts/settings.md) command. `0` might cause OutOfMemory crash on high-resolution devices like iPad Pro. | e.g. `0`, `1`, `2` |
|`skipLogCapture`|Skips to start capturing logs such as crash, system, safari console and safari network. It might improve performance such as network. Log related commands will not work. Defaults to `false`. |`true` or `false`|
|`safariGarbageCollect`|Turns on/off Web Inspector garbage collection when executing scripts on Safari. Turning on may improve performance. Defaults to `false`.|`true` or `false`|
|`includeSafariInWebviews`|Add Safari web contexts to the list of contexts available during a native/webview app test. This is useful if the
test opens Safari and needs to be able to interact with it. Defaults to `false`.|`true` or `false`|

## Opt-in Features (With Security Risk)

These can be enabled when running this driver through Appium, via the `--allow-insecure` or `--relaxed-security` flags.

|Feature Name|Description|
|------------|-----------|
|shutdown_other_sims|Allow any session to use a capability to shutdown any running simulators on the host|
|perf_record|Allow recording the system performance and other metrics of the simulator|

## Development<a id="development"></a>

This project has git submodules!

Clone with the `git clone --recursive` flag. Or, after cloning normally run `git submodule init` and then `git submodule update`

The `git diff --submodule` flag is useful here. It can also be set as the default `diff` format: `git config --global diff.submodule log`

`git config status.submodulesummary 1` is also useful.


### Watch

```
npm run watch
```


### Test

```
npm test
```

There are also a number of environment variables that can be used when running
the tests locally. These include:

* `REAL_DEVICE` - set to anything truthy, makes the tests use real device capabilities
* `_FORCE_LOGS` - set to `1` to get the log output, not just spec
* `PLATFORM_VERSION` - change the version to run the tests against (defaults to `9.3`)
* `XCCONFIG_FILE` - specify where the xcode config file is for a real device run (if
  blank, and running a real device test, it will search for the first file in
  the root directory of the repo with the extension "xcconfig")
* `UICATALOG_REAL_DEVICE` - path to the real device build of UICatalog, in case
  the npm installed one is not built for real device


### WebDriverAgent Updating

Updating FaceBook's [WebDriverAgent](https://github.com/facebook/WebDriverAgent)
is as simple as running updating the submodule and then committing the change:

```
git checkout -b <update-branch-name>
git submodule update --remote
git add WebDriverAgent
git commit -m "Updating upstream WebDriverAgent changes"
```

There is a chance that the update changed something critical, which will manifest
itself as `xcodebuild` throwing errors. The easiest remedy is to delete the
files, which are somewhere like `/Users/isaac/Library/Developer/Xcode/DerivedData/WebDriverAgent-eoyoecqmiqfeodgstkwbxkfyagll`.
This is also necessary when switching SDKs (e.g., moving from Xcode 7.3 to 8).
