# appium-xcuitest-driver

[![NPM version](http://img.shields.io/npm/v/appium-xcuitest-driver.svg)](https://npmjs.org/package/appium-xcuitest-driver)
[![Downloads](http://img.shields.io/npm/dm/appium-xcuitest-driver.svg)](https://npmjs.org/package/appium-xcuitest-driver)
[![Dependency Status](https://david-dm.org/appium/appium-xcuitest-driver.svg)](https://david-dm.org/appium/appium-xcuitest-driver)
[![devDependency Status](https://david-dm.org/appium/appium-xcuitest-driver/dev-status.svg)](https://david-dm.org/appium/appium-xcuitest-driver#info=devDependencies)

[![Build Status](https://api.travis-ci.org/appium/appium-xcuitest-driver.png?branch=master)](https://travis-ci.org/appium/appium-xcuitest-driver)

Appium XCUITest Driver is a combined solution, which allows to perform automated black-box testing of iOS and tvOS native applications and WebKit web views.
The native testing is based on Apple's [XCTest](https://developer.apple.com/documentation/xctest) framework and the fork of Facebook's [WebDriverAgent](https://github.com/appium/WebDriverAgent) server (the [original](https://github.com/facebookarchive/WebDriverAgent) project is not supported anymore).
Web views communication is done via [Webkit remote debugger protocol](https://github.com/appium/appium-remote-debugger). Real devices communication is ensured by [appium-ios-device](https://github.com/appium/appium-ios-device) library.
Simulators communication is ensured by [appium-ios-simulator](https://github.com/appium/appium-ios-simulator) library.

In the native mode the driver operates in scope of [WebDriver W3C protocol](https://w3c.github.io/webdriver) with several platform-specific extensions. Web views communication only supports the obsolete [JWP protocol](https://webdriver.io/docs/api/jsonwp.html).

*Note*: Issue tracking for this repo has been disabled. Please use the [main Appium issue tracker](https://github.com/appium/appium/issues) instead.


## Requirements

On top of standard Appium requirements XCUITest driver also expects the following prerequisites:

- Only macOS is supported as the host platform
- Xcode and developer tools must be installed. Note, that usually some time is needed for the Appium team to pick up with the support of the most recent Xcode versions, especially beta ones.
- Connected real devices must be trusted, added to your developer profile and configured properly along with WebDriverAgent signing. Read [Real devices](#real-devices) section _carefully_ to set them up properly before running your tests.
- The minimum supported Xcode SDK version for the current driver snapshot is *10.2 (iOS 12.2)*. Consider using earlier releases of the driver (see [Xcode version support](#xcode-version-support) section below) if it is necessary to test older iOS versions on real devices. Also, it is highly recommended to always use the same major version of Xcode SDK, which was used to build the particular iOS/tvOS version on your real device under test (for example Xcode 11 for iOS 13, Xcode 12 for iOS 14, etc).
- Web views must be debuggable in order to test them. If it is not possible to connect to your web view(s) using [Safari remote debugger](https://appletoolbox.com/use-web-inspector-debug-mobile-safari/) then XCUITest won't be able to connect to them as well.
- Since version 3.33.0 (included into Appium 1.20.0+) of XCUITest driver the [Carthage](https://github.com/Carthage/Carthage) dependency *is not needed anymore*. Prior to that version it was required and could be installed using [brew](https://brew.sh/): `brew install carthage`.


## Optional dependencies

- [xcpretty](https://github.com/supermarin/xcpretty) tool could be used to make Xcode output easier to read. It could be installed using `gem install xcpretty` command.
- For test video recording we use [ffmpeg](https://ffmpeg.org/). It could be installed using [brew](https://brew.sh/): `brew install ffmpeg`
- Facebook's [IDB](https://github.com/facebook/idb) tool could be used to improve some real device/Simulator interactions
- [WIX AppleSimulatorUtils](https://github.com/wix/AppleSimulatorUtils) could be used to improve some Simulator interactions


## Xcode version support

* module versions below `2.96.0` only supports XCode 8 and newer
* module version `2.96.0` and above only supports XCode 9 and newer
* module version `3.0.0` and above only supports Xcode 10 and newer
* module version `3.32.0` and above only supports Xcode 10.2 and newer


## Real devices

### Configuration

See [real device configuration documentation](docs/real-device-config.md).

### Known problems

After many failures on real devices it could transition to a state where connections are no longer being accepted. To possibly remedy this issue reboot the device. Read https://github.com/facebook/WebDriverAgent/issues/507 for more details.

#### Weird state

**Note:** Running `WebDriverAgent` tests on a real device is particularly flakey. If things stop responding, the only recourse is, most often, to restart the device. Logs in the form of the following _may_ start to occur:

```shell
info JSONWP Proxy Proxying [POST /session] to [POST http://10.35.4.122:8100/session] with body: {"desiredCapabilities":{"ap..."
dbug WebDriverAgent Device: Jul 26 13:20:42 iamPhone XCTRunner[240] <Warning>: Listening on USB
dbug WebDriverAgent Device: Jul 26 13:21:42 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - Unable to update application state promptly. <unknown> 0 1
dbug WebDriverAgent Device: Jul 26 13:21:57 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - Failed to get screenshot within 15s <unknown> 0 1
dbug WebDriverAgent Device: Jul 26 13:22:57 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - App state of (null) is still unknown <unknown> 0 1
```

### Real device security settings

On some systems, especially CI ones, where tests are executed by a command line agents, macOS Accessibility restrictions make the `WebDriverAgent` system unable to retrieve the development keys from the system keychain. This is usually manifest
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


## Capabilities

### General

Capability | Description
--- | ---
`platformName` | Could be set to `ios`. Appium itself is not strict about this capability value if `automationName` is provided, so feel free to assign it to any supported platform name if this is needed, for example, to make Selenium Grid working.
appium:automationName | Must always be set to `xcuitest`. Values of `automationName` are compared case-insensitively.
`appium:deviceName` | The name of the device under test. Consider setting `udid` for real devices and use this one for Simulator selection instead
`appium:platformVersion` | The platform version of an emulator or a real device. This capability is used for device autodetection if `udid` is not provided
`appium:udid` | UDID of the device to be tested. Could ve retrieved from Xcode->Window->Devices and Simulators window. Always set this capability if you run parallel tests or use a real device to run your tests.
`appium:noReset` | Prevents the device to be reset before the session startup if set to `true`. This means that the application under test is not going to be terminated neither its data cleaned. `false` by default
`appium:fullReset` | Being set to `true` always enforces the application under test to be fully uninstalled before starting a new session. `false` by default
`appium:printPageSourceOnFindFailure` | Enforces the server to dump the actual XML page source into the log if any error happens. `false` by default.
`browserName` | The name of the browser to run the test on. If this capability is provided then the driver will try to start the test in Web context mode (Native mode is applied by default). Read [Automating hybrid apps](https://appium.io/docs/en/writing-running-appium/web/hybrid/) for more details. Usually equals to `safari`.
`appium:includeDeviceCapsToSessionInfo` | Whether to include screen information as the result of [Get Session Capabilities](http://appium.io/docs/en/commands/session/get/). It includes `pixelRatio`, `statBarHeight` and `viewportRect`, but it causes an extra API call to WDA which may increase the response time like [this issue](https://github.com/appium/appium/issues/15101). Defaults to `true`.

### App

Capability | Description
--- | ---
`appium:bundleId` | Bundle identifier of the app under test, for example `com.mycompany.myapp`. The capability value is calculated automatically if `app` is provided. If neither `app` or `bundleId` capability is provided then XCUITest driver starts from the Home screen.
`appium:app` | Full path to the application to be tested (the app must be located on the same machine where the server is running). `.ipa` and `.app` application extensions are supported. Zipped `.app` bundles are supported as well. Could also be an URL to a remote location. If neither of the `app` or `bundleId` capabilities are provided then the driver starts from the Home screen and expects the test to know what to do next. Do not provide both `app` and `browserName` capabilities at once.
`appium:localizableStringsDir` | Where to look for localizable strings in the application bundle. Defaults to `en.lproj`
`appium:otherApps` | App or list of apps (as a JSON array) to install prior to running tests. Note that it will not work with iOS real devices. Fore example: `["http://appium.github.io/appium/assets/TestApp9.4.app.zip", "/path/to/app-b.app"]`
`appium:language` | Language to set for iOS, for example `fr`
`appium:locale` | Locale to set for iOS, for example `fr_CA`
`appium:appPushTimeout` | The timeout for application upload in milliseconds. Works for real devices only. The default value is `30000`ms

### WebDriverAgent

|Capability|Description|Values|
|----------|-----------|------|
|`appium:xcodeOrgId`|Apple developer team identifier string. Must be used in conjunction with `xcodeSigningId` to take effect.|e.g., `JWL241K123`|
|`appium:xcodeSigningId`|String representing a signing certificate. Must be used in conjunction with `xcodeOrgId`. This is usually just `iPhone Developer`, so the default (if not included) is `iPhone Developer`|e.g., `iPhone Developer`|
|`appium:xcodeConfigFile`|Full path to an optional Xcode configuration file that specifies the code signing identity and team for running the `WebDriverAgent` on the real device.|e.g., `/path/to/myconfig.xcconfig`|
|`appium:updatedWDABundleId`|Bundle id to update WDA to before building and launching on real devices. This bundle id _must_ be associated with a valid provisioning profile.|e.g., `io.appium.WebDriverAgentRunner`|
|`appium:keychainPath`|Full path to the private development key exported from the system keychain. Used in conjunction with `keychainPassword` when testing on real devices.|e.g., `/path/to/MyPrivateKey.p12`|
|`appium:keychainPassword`|Password for unlocking keychain specified in `keychainPath`.|e.g., `super awesome password`|
|`appium:derivedDataPath`| Use along with *usePrebuiltWDA* capability and choose where to search for the existing WDA app. If the capability is not set then Xcode will store the derived data in the default root taken from preferences.|
|`appium:webDriverAgentUrl`|If provided, Appium will connect to an existing `WebDriverAgent` instance at this URL instead of starting a new one.|e.g., `http://localhost:8100`|
|`appium:useNewWDA`|If `true`, forces uninstall of any existing `WebDriverAgent` app on device. Set it to `true` if you want to apply different startup options for `WebDriverAgent` for each session. Although, it is only guaranteed to work stable on Simulator. Real devices require `WebDriverAgent` client to run for as long as possible without reinstall/restart to avoid issues like https://github.com/facebook/WebDriverAgent/issues/507. The `false` value (the default behaviour since driver version 2.35.0) will try to detect currently running WDA listener executed by previous testing session(s) and reuse it if possible, which is highly recommended for real device testing and to speed up suites of multiple tests in general. A new WDA session will be triggered at the default URL (http://localhost:8100) if WDA is not listening and `webDriverAgentUrl` capability is not set. The negative/unset value of `useNewWDA` capability has no effect prior to xcuitest driver version 2.35.0.|e.g., `true`|
|`appium:wdaLaunchTimeout`|Time, in ms, to wait for `WebDriverAgent` to be pingable. Defaults to 60000ms.|e.g., `30000`|
|`appium:wdaConnectionTimeout`|Timeout, in ms, for waiting for a response from `WebDriverAgent`. Defaults to 240000ms.|e.g., `1000`|
|`appium:wdaStartupRetries`|Number of times to try to build and launch `WebDriverAgent` onto the device. Defaults to 2.|e.g., `4`|
|`appium:wdaStartupRetryInterval`|Time, in ms, to wait between tries to build and launch `WebDriverAgent`. Defaults to 10000ms.|e.g., `20000`|
|`appium:wdaLocalPort`|This value if specified, will be used to forward traffic from Mac host to real ios devices over USB. Default value is same as port number used by WDA on device.|e.g., `8100`|
|`appium:wdaBaseUrl`| This value if specified, will be used as a prefix to build a custom `WebDriverAgent` url. It is different from `webDriverAgentUrl`, because if the latter is set then it expects `WebDriverAgent` to be already listening and skips the building phase. Defaults to `http://localhost` | e.g., `http://192.168.1.100`|
|`appium:showXcodeLog`|Whether to display the output of the Xcode command used to run the tests. If this is `true`, there will be **lots** of extra logging at startup. Defaults to `false`|e.g., `true`|
|`appium:iosInstallPause`|Time in milliseconds to pause between installing the application and starting `WebDriverAgent` on the device. Used particularly for larger applications. Defaults to `0`|e.g., `8000`|
|`appium:usePrebuiltWDA`|Skips the build phase of running the WDA app. Building is then the responsibility of the user. Only works for Xcode 8+. Defaults to `false`.|e.g., `true`|
|`appium:shouldUseSingletonTestManager`|Use default proxy for test management within `WebDriverAgent`. Setting this to `false` sometimes helps with socket hangup problems. Defaults to `true`.|e.g., `false`|
|`appium:waitForIdleTimeout`|The amount of time in float seconds to wait until the application under test is idling. XCTest requires the app's main thread to be idling in order to execute any action on it, so WDA might not even start/freeze if the app under test is constantly hogging the main thread. The default value is `10` (seconds). Setting it to zero disables idling checks completely (not recommended) and has the same effect as setting `waitForQuiescence` to `false`. Available since Appium 1.20.0. |
|`appium:useXctestrunFile`|Use Xctestrun file to launch WDA. It will search for such file in `bootstrapPath`. Expected name of file is `WebDriverAgentRunner_iphoneos<sdkVersion>-arm64.xctestrun` for real device and `WebDriverAgentRunner_iphonesimulator<sdkVersion>-x86_64.xctestrun` for simulator. One can do `build-for-testing` for `WebDriverAgent` project for simulator and real device and then you will see [Product Folder like this](docs/useXctestrunFile.png) and you need to copy content of this folder at `bootstrapPath` location. Since this capability expects that you have already built `WDA` project, it neither checks whether you have necessary dependencies to build `WDA` nor will it try to build project. Defaults to `false`. _Tips: `Xcodebuild` builds for the target platform version. We'd recommend you to build with minimal OS version which you'd like to run as the original WDA module. e.g. If you build WDA for 12.2, the module cannot run on iOS 11.4 because of loading some module error on simulator. A module built with 11.4 can work on iOS 12.2. (This is xcodebuild's expected behaviour.)_ |e.g., `true`|
|`appium:useSimpleBuildTest`| Build with `build` and run test with `test` in xcodebuild for all Xcode version if this is `true`, or build with `build-for-testing` and run tests with `test-without-building` for over Xcode 8 if this is `false`. Defaults to `false`. | `true` or `false` |
|`appium:wdaEventloopIdleDelay`|Delays the invocation of `-[XCUIApplicationProcess setEventLoopHasIdled:]` by the number of seconds specified with this capability. This can help quiescence apps that fail to do so for no obvious reason (and creating a session fails for that reason). This increases the time for session creation because `-[XCUIApplicationProcess setEventLoopHasIdled:]` is called multiple times. If you enable this capability start with at least `3` seconds and try increasing it, if creating the session still fails. Defaults to `0`. |e.g. `5`|
|`appium:processArguments`|Process arguments and environment which will be sent to the `WebDriverAgent` server.|`{ args: ["a", "b", "c"] , env: { "a": "b", "c": "d" } }` or `'{"args": ["a", "b", "c"], "env": { "a": "b", "c": "d" }}'`|
|`appium:autoLaunch`|When set to `false`, prevents the application under test from being launched automatically as a part of the new session startup process. The launch become the responsibility of the user. Defaults to `true`.|`true` or `false`|
|`appium:allowProvisioningDeviceRegistration`|Allow `xcodebuild` to register your destination device on the developer portal if necessary. Requires a developer account to have been added in Xcode's Accounts preference pane. Defaults to `false`.|`true` or `false`|
|`appium:resultBundlePath`| Specify the path to the result bundle path as `xcodebuild` argument for `WebDriverAgent` build under a security flag (Please check _Opt-in Features_ section below). `WebDriverAgent` process must start/stop every time to pick up changed value of this property. Specifying `useNewWDA` to `true` may help there. Please read `man xcodebuild` for more details. | e.g. `/path/to/resultbundle` |
|`appium:resultBundleVersion`| Specify the version of result bundle as `xcodebuild` argument for `WebDriverAgent` build. The default value depends on your Xcode version. Please read `man xcodebuild` for more details. | e.g. `/path/to/resultbundle` |
|`appium:maxTypingFrequency`|Maximum frequency of keystrokes for typing and clear. If your tests are failing because of typing errors, you may want to adjust this. Defaults to 60 keystrokes per minute.|e.g., `30`|
|`appium:simpleIsVisibleCheck`|Use native methods for determining visibility of elements. In some cases this takes a long time. Setting this capability to `false` will cause the system to use the position and size of elements to make sure they are visible on the screen. This can, however, lead to false results in some situations. Defaults to `false`, except iOS 9.3, where it defaults to `true`. | e.g., `true`, `false`|
|`appium:waitForQuiescence`| It allows to turn on/off waiting for application quiescence in `WebDriverAgent`, while performing queries. The default value is `true`. You can avoid [this kind of issues](https://github.com/appium/appium/issues/11132) if you turn it off. Consider using `waitForIdleTimeout` capability instead for this purpose since Appium 1.20.0 | e.g `false` |
|`appium:mjpegServerPort`|The port number on which WDA broadcasts screenshots stream encoded into MJPEG format from the device under test. It might be necessary to change this value if the default port is busy because of other tests running in parallel. Default value: `9100`|e.g. `12000`|
|`appium:screenshotQuality`| Changes the quality of phone display screenshots following [xctest/xctimagequality](https://developer.apple.com/documentation/xctest/xctimagequality?language=objc)  Default value is `1`. `0` is the highest and `2` is the lowest quality. You can also change it via [settings](https://github.com/appium/appium/blob/master/docs/en/advanced-concepts/settings.md) command. `0` might cause OutOfMemory crash on high-resolution devices like iPad Pro. | e.g. `0`, `1`, `2` |
|`appium:autoAcceptAlerts`| Accept all iOS alerts automatically if they pop up. This includes privacy access permission alerts (e.g., location, contacts, photos). Default is `false`. |`true` or `false`|
|`appium:autoDismissAlerts`| Dismiss all iOS alerts automatically if they pop up. This includes privacy access permission alerts (e.g., location, contacts, photos). Default is `false`. |`true` or `false`|
|`appium:disableAutomaticScreenshots`| Disable automatic screenshots taken by XCTest at every interaction. Default is up to `WebDriverAgent`'s config to decide, which currently defaults to `true`. |`true` or `false`|
|`appium:shouldTerminateApp`| Specify if the app should be terminated on session end. This capability only has an effect if an application identifier has been passed to the test session (either explicitly, by setting bundleId, or implicitly, by providing app). Default is `true`. |`true` or `false`|

### Simulator

|Capability|Description|Values|
|----------|-----------|------|
|`appium:orientation`|Start a test in a certain orientation|`LANDSCAPE` or `PORTRAIT`|
|`appium:scaleFactor`|Simulator scale factor. This is useful to have if the default resolution of simulated device is greater than the actual display resolution. So you can scale the simulator to see the whole device screen without scrolling.|Acceptable values for simulators running Xcode SDK 8 and older are: `'1.0', '0.75', '0.5', '0.33' and '0.25'`, where '1.0' means 100% scale. For simulators running Xcode SDK 9 and above the value could be any valid positive float number. The capability must be of a string type.|
|`appium:connectHardwareKeyboard`|Set this option to `true` in order to enable hardware keyboard in Simulator. It is set to `false` by default, because this helps to workaround some XCTest bugs.|`true` or `false`|
|`appium:calendarAccessAuthorized`|Set this to `true` if you want to enable calendar access on IOS Simulator with given bundleId. Set to `false`, if you want to disable calendar access on IOS Simulator with given bundleId. If not set, the calendar authorization status will not be set.|e.g., `true`|
|`appium:calendarFormat`|Calendar format to set for the iOS Simulator|e.g. `gregorian`|
|`appium:isHeadless`|Set this capability to `true` if automated tests are running on Simulator and the device display is not needed to be visible. This only has an effect since Xcode9 and only for simulators. All running instances of Simulator UI are going to be automatically terminated if headless test is started. `false` is the default value.|e.g., `true`|
|`appium:simulatorWindowCenter`|Allows to explicitly set the coordinates of Simulator window center for Xcode9+ SDK. This capability only has an effect if Simulator window has not been opened yet for the current session before it started.|e.g. `{-100.0,100.0}` or `{500,500}`, spaces are not allowed|
|`appium:simulatorStartupTimeout`|Allows to change the default timeout for Simulator startup. By default this value is set to 120000ms (2 minutes), although the startup could take longer on a weak hardware or if other concurrent processes use much system resources during the boot up procedure.|e.g. `300000`|
|`appium:simulatorTracePointer`|Whether to highlight pointer moves in the Simulator window. The Simulator UI client must be shut down before the session startup in order for this capability to be applied properly. `false` by default.|e.g. `true`|
|`appium:shutdownOtherSimulators`|If this capability set to `true` and the current device under test is an iOS Simulator then Appium will try to shutdown all the other running Simulators before to start a new session. This might be useful while executing webview tests on different devices, since only one device can be debugged remotely at once due to an Apple bug. The capability only has an effect if `--relaxed-security` command line argument is provided to the server. Defaults to `false`.|e.g. `true`|
|`appium:enforceFreshSimulatorCreation`| Creates a new simulator in session creation and deletes it in session deletion. Defaults to `false`. | `true` or `false` |
|`appium:keepKeyChains`|Set the capability to `true` in order to preserve Simulator keychains folder after full reset. This feature has no effect on real devices. Defaults to `false`|e.g. `true`|
|`appium:keychainsExcludePatterns`|This capability accepts comma-separated path patterns, which are going to be excluded from keychains restore while full reset is being performed on Simulator. It might be useful if you want to exclude only particular keychain types from being restored, like the applications keychain. This feature has no effect on real devices.|e.g. `*keychain*.db*` to exclude applications keychain from being restored|
|`appium:reduceMotion`| It allows to turn on/off reduce motion accessibility preference. Setting reduceMotion `on` helps to reduce flakiness during tests. Only on simulators | e.g `true` |
|`appium:permissions`| Allows to set permissions for the specified application bundle on Simulator only. The capability value is expected to be a valid JSON string with `{"<bundleId1>": {"<serviceName1>": "<serviceStatus1>", ...}, ...}` format. Since Xcode SDK 11.4 Apple provides native APIs to interact with application settings. Check the output of `xcrun simctl privacy booted` command to get the list of available permission names. Use `yes`, `no` and `unset` as values in order to `grant`, `revoke` or `reset` the corresponding permission. Below Xcode SDK 11.4 it is required that `applesimutils` package is installed and available in PATH. The list of available service names and statuses can be found at https://github.com/wix/AppleSimulatorUtils. | e. g. `{"com.apple.mobilecal": {"calendar": "YES"}}` |
|`appium:iosSimulatorLogsPredicate`|Set the `--predicate` flag in the ios simulator logs|e.g.: `'process != "locationd" AND process != "DTServiceHub"' AND process != "mobileassetd"`|
|`appium:simulatorPasteboardAutomaticSync`| Handle the `-PasteboardAutomaticSync` flag when simulator process launches. It could improve launching simulator performance not to sync pasteboard with the system when this value is `off`. `on` forces the flag enabled. `system` does not provide the flag to the launching command. `on`, `off`, or `system` is available. They are case insensitive. Defaults to `off` | e.g. `system` |
|`appium:simulatorDevicesSetPath`| This capability allows to set an alternative path to the simulator devices set in case you have multiple sets deployed on your local system. Such feature could be useful if you, for example, would like to save disk space on the main system volume. | e.g. `/MyVolume/Devices` |
|`appium:customSSLCert`| Adds a root SSL certificate to IOS Simulator. | e.g. ```-----BEGIN CERTIFICATE-----MIIFWjCCBEKg...-----END CERTIFICATE-----```|
|`appium:webkitResponseTimeout`| (Real device only) Set the time, in ms, to wait for a response from WebKit in a Safari session. Defaults to `5000`|e.g., `10000`|

### Web Context

|Capability|Description|Values|
|----------|-----------|------|
|`appium:absoluteWebLocations`|This capability will direct the `Get Element Location` command, when used within webviews, to return coordinates which are relative to the origin of the page, rather than relative to the current scroll offset. This capability has no effect outside of webviews. Default `false`.|e.g., `true`|
|`appium:safariGarbageCollect`|Turns on/off Web Inspector garbage collection when executing scripts on Safari. Turning on may improve performance. Defaults to `false`.|`true` or `false`|
|`appium:includeSafariInWebviews`|Add Safari web contexts to the list of contexts available during a native/webview app test. This is useful if the test opens Safari and needs to be able to interact with it. Defaults to `false`.|`true` or `false`|
|`appium:safariLogAllCommunication`|Log all plists sent to and received from the Web Inspector, as plain text. For some operations this can be a lot of data, so it is recommended to be used only when necessary. Defaults to `false`.|`true` or `false`|
|`appium:safariLogAllCommunicationHexDump`|Log all communication sent to and received from the Web Inspector, as raw hex dump and printable characters. This logging is done _before_ any data manipulation, and so can elucidate some communication issues. Like `appium:safariLogAllCommunication`, this can produce a lot of data in some cases, so it is recommended to be used only when necessary. Defaults to `false`.|`true` or `false`|
|`appium:safariSocketChunkSize`|The size, in _bytes_, of the data to be sent to the Web Inspector on iOS 11+ real devices. Some devices hang when sending large amounts of data to the Web Inspector, and breaking them into smaller parts can be helpful in those cases. Defaults to `16384` (also the maximum possible)|e.g., `1000`|
|`appium:safariWebInspectorMaxFrameLength`| The maximum size in bytes of a single data frame for the Web Inspector. Too high values could introduce slowness and/or memory leaks. Too low values could introduce possible buffer overflow exceptions. Defaults to 20MB (`20*1024*1024`) |e.g. `1024`, `100*1024*1024` |
|`appium:additionalWebviewBundleIds`|Array (or JSON array) of possible bundle identifiers for webviews. This is sometimes necessary if the Web Inspector is found to be returning a modified bundle identifier for the app. Defaults to `[]`|e.g., `['io.appium.modifiedId', 'ABCDEF']`|
|`appium:webviewConnectTimeout`|The time to wait, in `ms`, for the initial presence of webviews in MobileSafari or hybrid apps. Defaults to `0`|e.g., '5000'|
|`appium:safariIgnoreWebHostnames`| Provide a list of hostnames (comma-separated) that the Safari automation tools should ignore. This is to provide a workaround to prevent a webkit bug where the web context is unintentionally changed to a 3rd party website and the test gets stuck. The common culprits are search engines (yahoo, bing, google) and `about:blank` |e.g. `'www.yahoo.com, www.bing.com, www.google.com, about:blank'`|
|`appium:nativeWebTap` | Enable native, non-javascript-based taps being in web context mode. Defaults to `false`. Warning: sometimes the preciseness of native taps could be broken, because there is no reliable way to map web element coordinates to native ones. | `true` |
|`appium:nativeWebTapStrict` | Enforce native taps to be done by XCUITest driver rather than WebDriverAgent. Only applicable if `nativeWebTap` is enabled. `false` by default | `false` |
|`appium:safariInitialUrl`| Initial safari url, default is a local welcome page | e.g. `https://www.github.com` |
|`appium:safariAllowPopups`| Allow javascript to open new windows in Safari. Default keeps current sim setting|`true` or `false`|
|`appium:safariIgnoreFraudWarning`| Prevent Safari from showing a fraudulent website warning. Default keeps current sim setting.|`true` or `false`|
|`appium:safariOpenLinksInBackground`| Whether Safari should allow links to open in new windows. Default keeps current sim setting.|`true` or `false`|
|`appium:webviewConnectRetries`| Number of times to send connection message to remote debugger, to get webview. Default: `8` |e.g., `12`|
|`appium:webkitResponseTimeout`| (Real device only) Set the time, in ms, to wait for a response from WebKit in a Safari session. Defaults to `5000`|e.g., `10000`|
|`appium:enableAsyncExecuteFromHttps`| Capability to allow simulators to execute asynchronous JavaScript on pages using HTTPS. Defaults to `false` | `true` or `false` |
|`appium:fullContextList` | Returns the detailed information on contexts for the [get available context](https://appium.io/docs/en/commands/context/get-contexts/index.html) command. If this capability is enabled, then each item in the returned contexts list would additionally include WebView title, full URL and the bundle identifier. Defaults to `false`. | `true` or `false` |
|`appium:enablePerformanceLogging`| Enable Safari's performance logging (default `false`)| `true`, `false`|
|`appium:autoWebview`| Move directly into Webview context if available. Default `false`|`true`, `false`|

### Other

|Capability|Description|Values|
|----------|-----------|------|
|`appium:resetOnSessionStartOnly`|Whether to perform reset on test session finish (`false`) or not (`true`). Keeping this variable set to `true` and Simulator running (the default behaviour since version 1.6.4) may significantly shorten the duration of test session initialization.|Either `true` or `false`. Defaults to `true`|
|`appium:commandTimeouts`|Custom timeout(s) in milliseconds for WDA backend commands execution. This might be useful if WDA backend freezes unexpectedly or requires too much time to fail and blocks automated test execution. The value is expected to be of type string and can either contain max milliseconds to wait for each WDA command to be executed before terminating the session forcefully or a valid JSON string, where keys are internal Appium command names (you can find these in logs, look for "Executing command 'command_name'" records) and values are timeouts in milliseconds. You can also set the 'default' key to assign the timeout for all other commands not explicitly enumerated as JSON keys.|`'120000'`, `'{"findElement": 40000, "findElements": 40000, "setValue": 20000, "default": 120000}'`|
|`appium:useJSONSource`|Get JSON source from WDA and transform it to XML on the Appium server side. Defaults to `false`.|e.g., `true`|
|`appium:skipLogCapture`|Skips to start capturing logs such as crash, system, safari console and safari network. It might improve performance such as network. Log related commands will not work. Defaults to `false`. |`true` or `false`|
|`appium:launchWithIDB`| Launch WebDriverAgentRunner with [idb](https://github.com/facebook/idb) instead of xcodebuild. This could save a significant amout of time by skiping the xcodebuild process, although the idb might not be very reliable, especially with fresh Xcode SDKs. Check the [idb repository](https://github.com/facebook/idb/issues) for more details on possible compatibility issues. Defaults to `false` |`true` or `false`|
|`appium:showIOSLog`| Whether to show any logs captured from a device in the appium logs. Default `false`|`true` or `false`|
|`appium:clearSystemFiles`|Whether to clean temporary XCTest files (for example logs) when a testing session is closed. `false` by default| `true` or `false`
|`appium:newCommandTimeout`|How long (in seconds) the driver should wait for a new command from the client before assuming the client has stopped sending requests. After the timeout the session is going to be deleted. `60` seconds by default. Setting it to zero disables the timer. |e.g. `100`|

## Element Attributes

XCUITest driver supports the following element attributes:

Name | Description | Example
--- | --- | ---
name | Could contain either element's [identifier](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500981-identifier?language=objc) or its [label](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500692-label?language=objc), depending on which one is available first. Could also be `null`. It is recommended to prefer the usage of [accessibilityIdentifier](https://developer.apple.com/documentation/uikit/uiaccessibilityidentification/1623132-accessibilityidentifier) over [accessibilityLabel](https://developer.apple.com/documentation/objectivec/nsobject/1615181-accessibilitylabel) for automation purposes, since the `identifier` property is supposed to stay constant under different locales and does not affect accessibility services such as VoiceOver. | 'hello'
label | Element's [label](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500692-label?language=objc) value. Could be `null` | 'hello'
type | Element's [type](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500614-elementtype?language=objc) name | 'XCUIElementTypeButton'
visible | Whether the element is visible. This value is not available in the "vanilla" XCTest and is read directly from the accessibility layer | 'false'
focused | Whether the element is [focused](https://developer.apple.com/documentation/xctest/xcuielementattributes/1627636-hasfocus?language=objc). *Only available for tvOS* | 'true'
accessible | Whether the element is accessible. This value is not available in the "vanilla" XCTest and is read directly from the accessibility layer | 'true'
enabled | Whether the element is [enabled](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500330-enabled?language=objc). | 'false'
selected | Whether the element is [selected](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500581-selected?language=objc) | 'false'
index | Element's index in the hierarchy relatively to its parent. Only available since Appium 1.20.0. Indexing starts from `0`. | '2'
rect | Element's rectangle. The actual data of this attribute is based on element's [frame](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500911-frame?language=objc). | {'x': 0, 'y': 0, 'width': 100, 'height': 100}
value | Element's value. This is a complex attribute, whose calculation algorithm depends on the actual element type. Check [WebDriverAgent sources](https://github.com/appium/WebDriverAgent/blob/master/WebDriverAgentLib/Categories/XCUIElement%2BFBWebDriverAttributes.m) to know more about how it is compiled (method `- (NSString *)wdValue`). Could be `null` | 'hello'


## Opt-in Features (With Security Risk)

These can be enabled when running this driver through Appium, via the `--allow-insecure` or `--relaxed-security` flags.

|Feature Name|Description|
|------------|-----------|
|shutdown_other_sims|Allow any session to use a capability to shutdown any running simulators on the host|
|perf_record|Allow recording the system performance and other metrics of the simulator|
|audio_record|Allow recording of host audio input(s)|
|customize_result_bundle_path|Allow customization of paths to result bundles by `resultBundlePath` capability|


## Settings API

XCUITest driver supports Appium [Settings API](https://appium.io/docs/en/advanced-concepts/settings/).
Along with the common settings the following driver-specific settings are currently available:

Name | Type | Description
--- | --- | ---
elementResponseAttributes | string | Comma-separated list of element attribute names to be included into findElement response. By default only element UUID is present there, but it is also possible to add the following items: `name`, `text`, `rect`, `enabled`, `displayed`, `selected`, `attribute/<element_attribute_name>`. It is required that `shouldUseCompactResponses` setting is set to `false` in order for this one to apply.
shouldUseCompactResponses | boolean | Used in combination with `elementResponseAttributes` setting. If set to `false` then the findElement response is going to include the items enumerated in `elementResponseAttributes` setting. `true` by default
screenshotQuality | int | See the description of the corresponding capability.
mjpegServerFramerate | int | The maximum count of screenshots per second taken by the MJPEG screenshots broadcaster. Must be in range 1..60. `10` by default
mjpegScalingFactor | int | The percentage value used to apply downscaling on the screenshots generated by the MJPEG screenshots broadcaster. Must be in range 1..100. `100` is by default, which means that screenshots are not downscaled.
mjpegServerScreenshotQuality | int | The percentage value used to apply lossy JPEG compression on the screenshots generated by the MJPEG screenshots broadcaster. Must be in range 1..100. `25` is by default, which means that screenshots are compressed to the quarter of their original quality.
customSnapshotTimeout (snapshotTimeout before 1.19.1) | float | Set how much time in float seconds is allowed to resolve a single accessibility snapshot with custom attributes. _Snapshots_ are mainly used for page source generation, XML lookup and custom attributes retrieval (these are visibility and accessibility ones). It might be necessary to increase this value if the actual page source is very large and contains hundreds of UI elements. Defaults to 15 seconds. Since Appium 1.19.1 if this timeout expires and no custom snapshot could be made then WDA tries to calculate the missing attributes using its own algorithms, so setting this value to zero might speed up, for example, page source retrieval, but for the cost of preciseness of some element attributes.
waitForIdleTimeout | float | Has the same meaning as corresponding capability (see above)
animationCoolOffTimeout | float | The amount of time in float seconds to wait until the application under test does not have any active animations. This check is usually applied after each automation action that is supposed to change the state of the application under test, like `click` one, and blocks XCTest until the transition of the tested application to a new state completes or the cool off timeout occurs. The default value is `2` (seconds). Setting it to zero disables animation checks completely.
snapshotMaxDepth | int | Changes the value of maximum depth for traversing elements source tree. It may help to prevent out of memory or timeout errors while getting the elements source tree, but it might restrict the depth of source tree. Please consider restricting this value if you observed an error like _Timed out snapshotting com.apple.testmanagerd..._ message or _Cannot get 'xml' source of the current application_ in your Appium log since they are possibly timeout related. A part of elements source tree might be lost if the value was too small. Defaults to `50`
useFirstMatch | boolean | Enabling this setting makes single element lookups faster, but there is the known [problem](https://github.com/appium/appium/issues/10101) related to nested elements lookup. Defaults to `false`.
reduceMotion | boolean | Changes the 'reduce motion' preference of accessibility feature. Defaults to `false`
defaultActiveApplication | string | Sets the hint for active application selection. This helps WebDriverAgent to select the current application if there are multiple items in the active applications list and the desired one is also one of them. The setting is particularly useful for split-screen apps automation. Defaults to `auto`, which makes WebDriverAgent to select the application whose element is located at `screenPoint` location or a single item from the active apps list if the length of this list is equal to one.
activeAppDetectionPoint | string | Defines the coordinates of the current screen point. WebDriverAgent uses this point to detect the active application if multiple application are active on the screen. The format of this value is `x,y`, where x and y are float or integer numbers representing valid screen coordinates. Setting this value to a point outside the actual screen coordinates might corrupt WebDriverAgent functionality. By default the screen point coordinates equal to 20% of the minimum screen dimension each, e.g. `MIN(w, h) * 0.2, MIN(w, h) * 0.2`
includeNonModalElements | boolean | Whether returns all of elements including no modal dialogs on iOS 13+. It fixes [cannot find elements on nested modal presentations](https://github.com/appium/appium/issues/13227), but it might make visibility attributes unreliable. You could also enable `shouldUseTestManagerForVisibilityDetection` setting (defaults to `false`) or `simpleIsVisibleCheck` capability to improve the visibility detection. This issue may happen between iOS 13.0 to 13.2 (Xcode 11.0 to 11.2). The query issued in `includeNonModalElements` returns `nil` with newer iOS/Xcode versions and Appium/WDA return proper elements three without this setting being used. Defaults to `false`.
acceptAlertButtonSelector | string | Allows to customize accept alert button selector. It helps you to handle an arbitrary element as accept button in `accept alert` command. The selector should be a valid [class chain](https://github.com/facebookarchive/WebDriverAgent/wiki/Class-Chain-Queries-Construction-Rules) expression, where the search root is the alert element itself. The default button location algorithm is used if the provided selector is wrong or does not match any element. Example: ```**/XCUIElementTypeButton[`label CONTAINS[c] 'accept'`]```
dismissAlertButtonSelector | string | Allows to customize dismiss alert button selector. It helps you to handle an arbitrary element as dismiss button in `dismiss alert` command. The selector should be a valid [class chain](https://github.com/facebookarchive/WebDriverAgent/wiki/Class-Chain-Queries-Construction-Rules) expression, where the search root is the alert element itself. The default button location algorithm is used if the provided selector is wrong or does not match any element. Example: ```**/XCUIElementTypeButton[`label CONTAINS[c] 'dismiss'`]```
screenshotOrientation | string | Adjust screenshot orientation for iOS. Appium tries to return a screenshot and adjust its orientation properly using internal heuristics, but sometimes it does not work, especially in landscape mode. The actual screenshot orientation depends on various factors such as OS versions, model versions and whether this is a real or simulator device. This option allows you to enforce the given image orientation. Acceptable values: `auto` (default), `portrait`, `portraitUpsideDown`, `landscapeRight`, `landscapeLeft`.
boundElementsByIndex | boolean | Whether to look up elements with [`allElementsBoundByAccessibilityElement`](https://developer.apple.com/documentation/xctest/xcuielementquery/1500816-allelementsboundbyaccessibilitye) (default) or [`allElementsBoundByIndex`](https://developer.apple.com/documentation/xctest/xcuielementquery/1500945-allelementsboundbyindex). [This Stack Overflow topic](https://stackoverflow.com/questions/49307513/meaning-of-allelementsboundbyaccessibilityelement) explains the differences. Defaults to `false`.
keyboardAutocorrection | boolean | Changes the 'Auto-Correction' preference in _Keyboards_ setting. Defaults to `false`.
keyboardPrediction | boolean | Changes the 'Predictive' preference in _Keyboards_ setting. Defaults to `false`.
nativeWebTap | boolean | See the description of the corresponding capability.
nativeWebTapStrict | boolean | See the description of the corresponding capability.
useJSONSource | boolean | See the description of the corresponding capability.


## Element Location

XCUITest driver supports the following location strategies in the native context:

Name | Description | Example
--- | --- | ---
id, name, accessibility id | All these locator types are synonyms and internally get transformed into search by element's `name` [attribute](#element-attributes). | `my name`
className | Performs search by element's `type` [attribute](#element-attributes). The full list of supported XCUIElement type names could be found in the official XCTest [documentation on XCUIElementType](https://developer.apple.com/documentation/xctest/xcuielementtype) | `XCUIElementTypeButton`
-ios predicate string | This strategy is mapped to the native XCTest predicate locator. Check the [NSPredicate cheat sheet](https://academy.realm.io/posts/nspredicate-cheatsheet/) for more details on how to build effective predicate expressions. All the supported element [attributes](#element-attributes) could be used in these expressions. | `(name == 'done' OR value == 'done') AND type IN {'XCUIElementTypeButton', 'XCUIElementTypeKey'}`
-ios class chain | This strategy is mapped to the native XCTest predicate locator, but with respect to the actual element tree hierarchy. Such locators are basically a supertype of `-ios predicate string`. Read [Class Chain Queries Construction Rules](https://github.com/facebookarchive/WebDriverAgent/wiki/Class-Chain-Queries-Construction-Rules) for more details on how to build such locators. | ```**/XCUIElementTypeCell[$name == 'done' OR value == 'done'$]/XCUIElementTypeButton[-1]```
xpath | For elements lookup using the Xpath strategy the driver uses the same XML tree that is generated by the page source API. This means such locators are the slowest (sometimes up to 10x slower) in comparison to the ones above, which all depend on native XCTest primitives, but are the most flexible. Use Xpath locators only if there is no other way to locate the given element. Only Xpath 1.0 is supported. | `//XCUIElementTypeButton[@value=\"Regular\"]/parent::*`

Also, consider checking the [How To Achieve The Best Lookup Performance](https://github.com/facebookarchive/WebDriverAgent/wiki/How-To-Achieve-The-Best-Lookup-Performance) article.


## Parallel Tests

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


## Platform-Specific Extensions

Beside of standard W3C APIs the driver provides the following custom command extensions to execute platform specific scenarios:

### mobile: selectPickerWheelValue

Performs selection of the next or previous picker wheel value. This might
be useful if these values are populated dynamically, so you don't know which
one to select or value selection suing `sendKeys` API does not work because of an XCTest bug. The method throws an exception if it fails to change the current picker value.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
element | string | yes | PickerWheel's internal element id (as hexadecimal hash string) to perform value selection on. The element must be of type XCUIElementTypePickerWheel | abcdef12-1111-2222-3333-444444
order | string | yes | Either `next` to select the value next to the current one from the target picker wheel or `previous` to select the previous one. | next
offset | number | no | The value in range [0.01, 0.5]. It defines how far from picker wheel's center the click should happen. The actual distance is calculated by multiplying this value to the actual picker wheel height. Too small offset value may not change the picker wheel value and too high value may cause the wheel to switch two or more values at once. Usually the optimal value is located in range [0.15, 0.3]. `0.2` by default | 0.15

### mobile: alert

Tries to apply the given action to the currently visible alert.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
action | string | yes | The actual action to apply. Could be either: `accept`, `dismiss` or `getButtons` | accept
buttonLabel | string | no | The name of the button used to perform the chosen alert action. Only makes sense if the action is `accept` or `dismiss` | Accept

#### Returned Result

The list of alert button names if the selected action is `getButtons`

### mobile: setPasteboard

Sets the Simulator's pasteboard content to the given value. Does not work for real devices.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
content | string | yes | The content to set | hello
encoding | string | no | The content's encoding. `utf8` by default | ascii

### mobile: getPasteboard

Gets the Simulator's pasteboard content. Does not work for real devices.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
encoding | string | no | The expected encoding of the returned string. `utf8` by default | ascii

#### Returned Result

The pasteboard content string.

### mobile: source

Allows to retrieve the source tree of the current page in different representation formats.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
format | string | yes | One of possible page tree source representation formats: `xml` (the default value), `description` and `json`. The `xml` format generates the output similar to what `getPageSource` standard API returns. `description` representation is how XCTest "sees" the page internally and is the same string as [debugDescription](https://developer.apple.com/documentation/xctest/xcuielement/1500909-debugdescription?language=objc) API would return for the root application element. This source representation format is useful for debugging purposes and is the fastest one to fetch. `json` representation is similar to `xml`, but the tree hierarchy there is represented as JSON elements tree rather than as XML nodes. | description
excludedAttributes | string | no | One or more comma-separated attribute names to be excluded from the XML output, thus only makes sense if `format` is set to `xml`. It might be sometimes helpful to exclude, for example, the `visible` attribute, to significantly speed-up page source retrieval. | visible,accessible

#### Returned Result

The page source tree formatted according to the given format argument.

### mobile: getContexts

Retrieves the list of available contexts including the extended context information, like urls and page names. This is different from the standard `getContexts` API, because the latter only has web view names without any additional information. In situation where multiple web views are available at once the client code would have to connect to each of them in order to detect the one, which needs to be interacted with. Although, this extra effort is not needed with the information provided by this extension.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
waitForWebviewMs | number | no | Tells Appium for how long (in milliseconds) to wait for web view(s) to appear. `5000`ms by default | 10000

#### Returned Result

The list of available context objects along with their properties:

- id: The identifier of the context. The native context will be 'NATIVE_APP' and the webviews will be 'WEBVIEW_xxx'
- title: The title associated with the webview content. Could be `null`
- url: The url associated with the webview content. Could be `null`

### mobile: installApp

Installs the given application to the device under test. Make sure the app is built for a correct architecture and is signed with a proper signature (for real devices) prior to install it.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
app | string | yes | See the description of the `appium:app` capability | /path/to/my.app

### mobile: isAppInstalled

Checks whether the given application is installed on the device under test.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be checked | com.mycompany.myapp

#### Returned Result

Either `true` or `false`

### mobile: removeApp

Removes the given application from the device under test.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be removed | com.mycompany.myapp

#### Returned Result

Either `true` if the app was successfully uninstalled, otherwise `false`

### mobile: launchApp

Executes the given app on the device under test. If the app is already running then it would be activated. If the app is not installed or cannot be launched then an exception is thrown.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be launched | com.mycompany.myapp
arguments | string|array | no | One or more command line arguments for the app. If the app is already running then this argument is ignored. | ['-s', '-m']
environment | dict | no | Environment variables mapping for the app. If the app is already running then this argument is ignored. | {'var': 'value'}

### mobile: terminateApp

Terminates the given app on the device under test. If the app is not installed an exception is thrown. If the app is not running then nothing is done.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be terminated | com.mycompany.myapp

#### Returned Result

Either `true` if the app was successfully terminated, otherwise `false`

### mobile: queryAppState

Queries the state of an installed application from the device under test. An exception will be thrown if the app with given identifier is not installed.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be queried | com.mycompany.myapp

#### Returned Result

An integer number is returned, which encodes the application state. Possible values are described in [XCUIApplicationState](https://developer.apple.com/documentation/xctest/xcuiapplicationstate?language=objc) XCTest documentation topic.

### mobile: activateApp

Puts the given application to foreground if it is running in the background. An error is thrown if the app is not installed or is not running. Nothing is done if the app is already running in the foreground.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be activated | com.mycompany.myapp

### mobile: startPerfRecord

Starts performance profiling for the device under test.
Relaxing security is mandatory for simulators. It can always work for real devices.
Since XCode 12 the method tries to use `xctrace` tool to record performance stats.
The `instruments` developer utility is used as a fallback for this purpose if `xctrace` is not available. It is possible to record multiple profiles at the same time. Read [Instruments User Guide](https://developer.apple.com/library/content/documentation/DeveloperTools/Conceptual/InstrumentsUserGuide/Recording,Pausing,andStoppingTraces.html) for more details.
If the recording for the given profile is already running then nothing is done.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
timeout | number | no | The maximum count of milliseconds to record the profiling information. It is recommended to always limit the maximum duration of perf record operation, since the resulting logs are pretty huge and may easily exceed the free space on th local storage volume. `300000`ms by default (5 minutes) | `600000`
profileName | string | no | The name of existing performance profile to apply. Can also contain the full path to the chosen template on the server file system. Note, that not all profiles are supported on mobile devices. `Activity Monitor` by default. | `Time Profile`
pid | string or number | no | The ID of the process to measure the performance for. Set it to `current` in order to measure the performance of the process, which belongs to the currently active application. All processes running on the device are measured if pid is unset (the default setting). | current

### mobile: stopPerfRecord

Stops the performance recording operation previosuly started by `mobile: startPerfRecord` call. If the previous call has already been completed due to the timeout then its result is returned immediately. An error is thrown if the performance recording has failed to start and recorded no data.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
profileName | string | no | The name of existing performance profile to stop the recording for. Multiple recorders for different profile names could be executed at the same time. `Activity Monitor` by default. | `Time Profile`
remotePath | string | no | The path to the remote location, where the resulting zipped .trace file should be uploaded. The following protocols are supported: http/https, ftp Null or empty string value (the default setting) means the content of resulting file should be zipped, encoded as Base64 and passed as the endpoint response value. An exception will be thrown if the generated file is too big to fit into the available process memory. | https://myserver/upload
user | string | no | The name of the user for the remote authentication. Only works if `remotePath` is provided. | myuser
pass | string | no | The password for the remote authentication. Only works if `remotePath` is provided. | mypassword
method | string | no | The http multipart upload method name. Only works if `remotePath` is provided. `PUT` by default | POST
headers | dict | no | Additional headers mapping for multipart http(s) uploads | {'User-Agent': 'Myserver 1.0'}
fileFieldName | string | no | The name of the form field, where the file content BLOB should be stored for http(s) uploads. `file` by default | payload
formFields | dict or array | no | Additional form fields for multipart http(s) uploads | {'field2': 'value2'}

#### Returned Result

The resulting file in .trace format can be either returned directly as base64-encoded zip archive or uploaded to a remote location (such files could be pretty large), depending on the `remotePath` argument value. Afterwards it is possible to unarchive and open such file with Xcode Developer Tools.

### mobile: installCertificate

Installs a custom certificate onto the device. Since Xcode SDK 11.4 Apple has added a dedicated simctl subcommand to quickly handle certificates on Simulator over CLI.
On real devices or simulators before Xcode 11.4 SDK Apple provides no official way to do it via the command line. In such case (and also as a fallback if CLI setup fails) this method tries to wrap the certificate into .mobileconfig format and then deploys the wrapped file to the internal HTTP server, so one can open it via mobile Safari. Then the algorithm goes through the profile installation procedure by clicking the necessary buttons using WebDriverAgent.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
content | string | yes | Base64-encoded content of the public certificate | a23234...
commonName | string | no | Common name of the certificate. If this is not set then the script will try to parse it from the given certificate content. | com.myorg
isRoot | boolean | no | This option defines where the certificate should be installed to: either Trusted Root Store (`true`, the default option) or the Keychain (`false`). On environments other than Xcode 11.4+ Simulator this option is ignored. | false

#### Returned Result

The content of the generated .mobileconfig file as base64-encoded string. This config might be useful for debugging purposes. If the certificate has been successfully set via CLI then nothing is returned.

### mobile: startLogsBroadcast

Starts iOS system logs broadcast websocket on the same host and port where Appium server is running at `/ws/session/:sessionId:/appium/syslog` endpoint. The method will return immediately if the web socket is already listening.
Each connected webcoket listener will receive syslog lines as soon as they are visible to Appium.
Read [Using Mobile Execution Commands to Continuously Stream Device Logs with Appium](https://appiumpro.com/editions/55-using-mobile-execution-commands-to-continuously-stream-device-logs-with-appium) Appium Pro article for more details on this feature.

### mobile: stopLogsBroadcast

Stops the syslog broadcasting wesocket server previously started by `mobile: startLogsBroadcast`. This method will return immediately if no server is running.

### mobile: batteryInfo

Reads the battery information from the device under test. This endpoint only returns reliable result on real devices.

#### Returned Result

The actual battery info map, which consists of the following entries:

- level: Battery level in range [0.0, 1.0], where 1.0 means 100% charge.
- state: Battery state as an integer number. The following values are possible:
   *   UIDeviceBatteryStateUnknown = 0
   *   UIDeviceBatteryStateUnplugged = 1  // on battery, discharging
   *   UIDeviceBatteryStateCharging = 2   // plugged in, less than 100%
   *   UIDeviceBatteryStateFull = 3       // plugged in, at 100%

### mobile: deviceInfo

Returns the miscellaneous information about the device under test.

#### Returned Result

Check the `+ (id<FBResponsePayload>)handleGetDeviceInfo:(FBRouteRequest *)request` method in [FBCustomCommands.m](https://github.com/appium/WebDriverAgent/blob/master/WebDriverAgentLib/Commands/FBCustomCommands.m) for more details on the available map entries.

### mobile: getDeviceTime

Returns the actual device time.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
format | string | no | The format specifier string. Read [MomentJS documentation](https://momentjs.com/docs/) to get the full list of supported datetime format specifiers. The default format is `YYYY-MM-DDTHH:mm:ssZ`, which complies to ISO-8601 | YYYY-MM-DD HH:mm:ss

#### Returned Result

The retrieved datetime string formatted according to the given format specfier.

### mobile: activeAppInfo

Returns information about the active application.

#### Returned Result

Check the `+ (id<FBResponsePayload>)handleActiveAppInfo:(FBRouteRequest *)request` method in [FBCustomCommands.m](https://github.com/appium/WebDriverAgent/blob/master/WebDriverAgentLib/Commands/FBCustomCommands.m) for more details on the available map entries.

### mobile: pressButton

Emulates press action on the given physical device button.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
name | string | yes | The name of the button to be pressed. Supported button names for iOS-based devices are (case-insensitive): `home`, `volumeup`, `volumedown`. For tvOS-based devices (case-insensitive): `home`, `up`, `down`, `left`, `right`, `menu`, `playpause`, `select` | home

### mobile: pushNotification

Simulates push notification delivery to Simulator.
Only application remote push notifications are supported. VoIP, Complication, File Provider,
and other types are not supported. Check the output of `xcrun simctl help push`
command for more details.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the target application | com.apple.Preferences
payload | map | yes | Valid Apple Push Notification values. Read the `Create the JSON Payload` topic of the [official Apple documentation](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/generating_a_remote_notification?language=objc) for more details on the payload creation. | `{"aps": {"alert": "This is a simulated notification!", "badge": 3, "sound": "default"} }`

### mobile: expectNotification

Blocks until the expected notification is delivered.
It is a thin wrapper over [XCTNSNotificationExpectation](https://developer.apple.com/documentation/xctest/xctnsnotificationexpectation?language=objc) and
[XCTDarwinNotificationExpectation](https://developer.apple.com/documentation/xctest/xctdarwinnotificationexpectation?language=objc) entities.
The extension call throws [TimeoutError](https://www.selenium.dev/selenium/docs/api/javascript/module/selenium-webdriver/lib/error_exports_TimeoutError.html) if the expected notification has not been delivered within the given timeout.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
name | string | yes | The name of the notification to expect | com.example.fooAllDone
type | string | no | Which notification type to expect. Either `plain` (the default value) to wait for a notification from the *default* notification center or `darwin` to wait for a system notification. | darwin
timeoutSeconds | number | no | For how long to wait until the notification is delivered in float seconds. 60 seconds by default | 5.5

### mobile: performIoHidEvent

Emulates triggering of the given low-level IO HID device event. Constants for possible events are defined
in [XNU kernel IO HID usage tables](https://unix.superglobalmegacorp.com/xnu/newsrc/iokit/IOKit/hidsystem/IOHIDUsageTables.h.html).
For example, in order to emulate single press on Home button the extension should be called with the following arguments:
- page: `0x0C` (`kHIDPage_Consumer`, select the `Customer` page)
- usage: `0x40` (`kHIDUsage_Csmr_Menu`, the `Csmr` prefix here means this usage is dedicated to the `Customer` page)
- durationSeconds: `0.005` (The event duration should be 5 milliseconds to be recognized as a single press by iOS)

Some popular constants:

Name | Value | Description
--- | --- | ---
kHIDPage_Consumer | 0x0C | The page containing all usages prefixed with `kHIDUsage_Csmr_`
kHIDUsage_Csmr_VolumeIncrement | 0xE9 | Volume Up
kHIDUsage_Csmr_VolumeDecrement | 0xEA | Volume Down
kHIDUsage_Csmr_Menu | 0x40 | Home
kHIDUsage_Csmr_Power | 0x30 | Power/Lock
kHIDUsage_Csmr_Snapshot | 0x65 | Power + Home

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
page | int | yes | The event page identifier. Look for constants perfixed with `kHIDPage_` in the table above | 0x0C
usage | int | yes | The event usage identifier (usages are defined per-page). Look for constants prefixed with `kHIDUsage_` in the table above | 0x40
durationSeconds | number | yes | The event duration in float seconds. XCTest uses `0.005` for a single press event duration | 2.5

### mobile: enrollBiometric

Enrolls biometric authentication on Simulator.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
isEnabled | boolean | no | Whether to enable/disable biometric enrollment. `true` by default. | true

### mobile: sendBiometricMatch

Emulates biometric match/non-match event on Simulator. The biometric feature is expected to be already enrolled before executing that.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
type | string | no | The biometric feature name. Either `touchId` or `faceId`. `touchId` by default. | faceId
match | boolean | no | Whether to simulate biometric match (`true`, the default value) or non-match (`false`). | true

### mobile: isBiometricEnrolled

Checks whether biometric is currently enrolled or not on a Simulator device.

#### Returned Result

Either `true` or `false`

### mobile: clearKeychains

Clears keychains on Simulator. An exception is thrown for real devices.

### mobile: getPermission

Gets application permission state on Simulator. This method requires [WIX applesimutils](https://github.com/wix/AppleSimulatorUtils) to be installed on the host where Appium server is running.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the destination app. | com.mycompany.myapp
service | string | yes | One of available service names. The following services are supported: `calendar`, `camera`, `contacts`, `homekit`, `microphone`, `photos`, `reminders`, `medialibrary`, `motion`, `health`, `siri`, `speech`. | true

#### Returned Result

Either 'yes', 'no' or 'unset'.

### mobile: setPermission

Set application permission state on Simulator. This method requires [WIX applesimutils](https://github.com/wix/AppleSimulatorUtils) to be installed on the host where Appium server is running.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the destination app. | com.mycompany.myapp
access | map | yes | One or more access rules to set. The following keys are supported: `all` (Apply the action to all services), `calendar` (Allow access to calendar), `contacts-limited` (Allow access to basic contact info), `contacts` (Allow access to full contact details), `location` (Allow access to location services when app is in use), `location-always` (Allow access to location services at all times), `photos-add` (Allow adding photos to the photo library), `photos` (Allow full access to the photo library), `media-library` (Allow access to the media library), `microphone` (Allow access to audio input), `motion` (Allow access to motion and fitness data), `reminders` (Allow access to reminders), `siri` (Allow use of the app with Siri.). The following values are supported: `yes` (To grant the permission), `no` (To revoke the permission), `unset` (To reset the permission) | {'all': 'yes'}

### mobile: resetPermission

Resets the given permission for the active application under test. Works for both Simulator and real devices using Xcode SDK 11.4+

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
service | string or int | yes | One of available service names. The supported service names are: `calendar`, `camera`, `contacts`, `health`, `homekit`, `keyboardnet`, `location`, `medialibrary`, `microphone`, `photos`, `reminders`, `systemroot`, `userdesktop`, `userdocuments`, `userdownloads`, `bluetooth`. This could also be an integer protected resource identifier taken from [XCUIProtectedResource](https://developer.apple.com/documentation/xctest/xcuiprotectedresource?language=objc) | photos

### mobile: getAppearance

Get the device's UI appearance style.

#### Returned Result

An object, with the following entries:
- style: The device's UI appearance value. This could be one of: `light`, `dark`, `unknown`, `unsupported`

### mobile: setAppearance

Set the device's UI appearance style.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
style | string | yes | Either `light` or `dark` | dark

### mobile: siriCommand

Presents the Siri UI, if it is not currently active, and accepts a string which is then processed as if it were recognized speech. Check the documentation on [activateWithVoiceRecognitionText](https://developer.apple.com/documentation/xctest/xcuisiriservice/2852140-activatewithvoicerecognitiontext?language=objc) XCTest method for more details.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
text | string | yes | The actual command that will be passed to Siri service | Hello Siri

### mobile: deleteFile

Deletes the given file from the device under test.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | yes | The path to an existing remote file on the device. This variable can be prefixed with bundle id, so then the file will be downloaded from the corresponding application container instead of the default media folder. Use `@<app_bundle_id>:<optional_container_type>/<path_to_the_file_or_folder_inside_container>` format to delete a file or a folder from an application container of the given type. The only supported container type is 'documents'. If the container type is not set explicitly for a bundle id, then the default application container is going to be mounted (aka --container ifuse argument) e.g. If `@com.myapp.bla:documents/111.png` is provided, `On My iPhone/<app name>` in Files app will be mounted to the host machine. `@com.myapp.bla:documents/` means `On My iPhone/<app name>`. | @com.mycompany.myapp:documents/myfile.txt

### mobile: deleteFolder

Deletes the given folder from the device under test.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | yes | Same value as for `mobile: deleteFile` except of the fact it should be pointing to a folder and should end with a single slash `/` | @com.mycompany.myapp:documents/myfolder/

### mobile: startAudioRecording

Records the given hardware audio input into an .mp4 file. You must allow the `audio_record` security feature in order to use this extension. Also it is required that [FFMpeg](https://ffmpeg.org/) is installed on the machibe where Appium server is running.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
audioInput | string or int | yes | The name of the corresponding audio input device to use for the capture. The full list of capture devices could be shown using `ffmpeg -f avfoundation -list_devices true -i ""` Terminal command. | 1
audioCodec | string | no | The name of the audio codec. The Advanced Audio Codec (aac) is used by default. | aac
audioBitrate | string | no | The bitrate of the resulting audio stream. `128k` by default. | 256k
audioChannels | string or int | no | The count of audio channels in the resulting stream. Setting it to `1` will create a single channel (mono) audio stream. `2` By default | 1
audioRate | string or int | no | The sampling rate of the resulting audio stream. 44100 by default | 22050
timeLimit | string or int | no | The maximum recording time, in seconds. The default value is `180`, the maximum value is `43200` (12 hours). | 60
forceRestart | boolean | no | Whether to restart audio capture process forcefully when startRecordingAudio is called (`true`) or ignore the call until the current audio recording is completed (`false`, the default value). | true

### mobile: stopAudioRecording

Stops recording of the audio input. If no audio recording process is running then the endpoint will try to get the recently recorded file. If no previously recorded file is found and no active audio recording processes are running then the method returns an empty string.

#### Returned Result

Base64-encoded content of the recorded media file or an empty string if no audio recording has been started before.

### mobile: runXCTest

Run a native XCTest script. Launches a subprocess that runs the XC Test and blocks until it is completed. Parses the stdout of the process and returns its result as an array. Facebook's [IDB](https://github.com/facebook/idb) tool is required to run such tests.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
testRunnerBundleId | string | yes | Test app bundle | io.appium.XCTesterAppUITests.xctrunner
appUnderTestBundleId | string | yes | App-under-test bundle | com.mycompany.myapp
xcTestBundleID | string | yes | xctest bundle id | io.appium.XCTesterAppUITests
testType | string | no | Test type. Either `ui` (the default one), `app` or `logic` | app
env | map | no | Environment variables mapping to be passed to the test | {'myvar': 'myvalue'}
args | array | no | Launch arguments to start the test with (see https://developer.apple.com/documentation/xctest/xcuiapplication/1500477-launcharguments for reference) | ['-arg1', '--arg2']
timeout | string or int | no | Timeout if session doesn't complete after given time (in milliseconds). `360000`ms by default | 120000

#### Returned Result

The API calls returns a map with the following entries:

- results: The array of test results. Each item in this array conists of the following entries:
   * testName: Name of the test (e.g.: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample')
   * passed: Did the tests pass?
   * crashed: Did the tests crash?
   * duration: How long did the tests take (in seconds)
   * failureMessage: Failure message (if applicable)
   * location The geolocation of the test (if applicable)
- code: The exit code of the process. `0` value marks a successful execution.
- signal: The signal that terminated the process. Could be `null` (e.g.: `SIGTERM`)

### mobile: installXCTestBundle

Installs an XCTest bundle to the device under test. Facebook's [IDB](https://github.com/facebook/idb) tool is required to for this API to work.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
xctestBundle | string | yes | Path to your xctest .app bundle. Could be an URL | /path/to/my/bundle.app

### mobile: listXCTestBundles

List XCTest bundles that are installed on device. Facebook's [IDB](https://github.com/facebook/idb) tool is required to for this API to work.

#### Returned Result

Array of XCTest bundles (e.g.: ["XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance"])

### mobile: listXCTestsInTestBundle

List XCTests in a test bundle. Facebook's [IDB](https://github.com/facebook/idb) tool is required to for this API to work.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundle | string | yes | Bundle ID of the XCTest | 'com.bundle.myapp'

#### Returned Result

Array of xctests in the test bundle (e.g.: `[ 'XCTesterAppUITests.XCTesterAppUITests/testExample', 'XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance' ]`)

### mobile: viewportRect

Retrieves the viwport dimensions.
The viewport is the device's screen size with status bar size subtracted if the latter is present/visible.

#### Returned Result

The response looks like `{"value":{"left":0,"top":96,"width":828,"height":1696}}`.

`left` and `top` are distance from the `left` of the screen and the `top` of the screen. [iOS Drawing Concepts](https://developer.apple.com/library/archive/documentation/2DDrawing/Conceptual/DrawingPrintingiOS/GraphicsDrawingOverview/GraphicsDrawingOverview.html) could help about the relationship of coordinate.

`width` and `height` are the screen's width and height.

### mobile: deviceScreenInfo

Get information about screen.

#### Returned Result

The response looks like `{"value":{"statusBarSize":{"width":414,"height":48},"scale":2}}`

`statusBarSize` contains status bar dimensions. It is the result of [status bar](https://developer.apple.com/documentation/xctest/xcuielementtypequeryprovider/1500428-statusbars).
`scale` is [screen scale](https://developer.apple.com/documentation/uikit/uiscreen/1617836-scale).



### Mobile Gesture Commands

XCUITest driver provides several extensions that allow to automate popular mobile gesture shortcuts:

- mobile: tap
- mobile: scroll
- mobile: pinch
- mobile: doubleTap
- mobile: touchAndHold
- mobile: twoFingerTap
- mobile: tap
- mobile: dragFromToForDuration
- mobile: tapWithNumberOfTaps
- mobile: rotateElement

These gestures are documented in the [Automating Mobile Gestures for iOS](https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/ios/ios-xctest-mobile-gestures.md) tutorial. Refer [W3C Actions API](https://appiumpro.com/editions/29-automating-complex-gestures-with-the-w3c-actions-api) if you need to automate more complicated gestures.


## Known issues

* `shake` is implemented via AppleScript and works only on Simulator due to lack of support from Apple


## Sim Resetting

By default, this driver will create a new iOS simulator and run tests on it, deleting the simulator afterward.

If you specify a specific simulator using the `udid` capability, this driver will boot the specified simulator and shut it down afterwards.

If a udid is provided and the simulator is already running, this driver will leave it running after the test run.

In short, this driver tries to leave things as it found them.

You can use the `noReset` capability to adjust this behavior.
Setting `noReset` to `true` will leave the simulator running at the end of a test session.


### Development

To install the project check it out from GitHub and run:

```
npm install
```

To watch changes during the development:

```
npm run watch
```

To run unit/functional tests:

```
npm test
npm e2e-test
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
