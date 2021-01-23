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
|`appium:simpleIsVisibleCheck`|Use native methods for determining visibility of elements. In some cases this takes a long time. Setting this capability to `false` will cause the system to use the position and size of elements to make sure they are visible on the screen. This can, however, lead to false results in some situations. Defaults to `false`, except iOS 9.3, where it defaults to `true`.|e.g., `true`, `false`|
|`appium:waitForQuiescence`| It allows to turn on/off waiting for application quiescence in `WebDriverAgent`, while performing queries. The default value is `true`. You can avoid [this kind of issues](https://github.com/appium/appium/issues/11132) if you turn it off.
Consider using `waitForIdleTimeout` capability instead for this purpose since Appium 1.20.0 |e.g `false`|
|`appium:mjpegServerPort`|The port number on which WDA broadcasts screenshots stream encoded into MJPEG format from the device under test. It might be necessary to change this value if the default port is busy because of other tests running in parallel. Default value: `9100`|e.g. `12000`|
|`appium:screenshotQuality`| Changes the quality of phone display screenshots following [xctest/xctimagequality](https://developer.apple.com/documentation/xctest/xctimagequality?language=objc)  Default value is `1`. `0` is the highest and `2` is the lowest quality. You can also change it via [settings](https://github.com/appium/appium/blob/master/docs/en/advanced-concepts/settings.md) command. `0` might cause OutOfMemory crash on high-resolution devices like iPad Pro. | e.g. `0`, `1`, `2` |
|`appium:autoAcceptAlerts`| Accept all iOS alerts automatically if they pop up. This includes privacy access permission alerts (e.g., location, contacts, photos). Default is `false`. |`true` or `false`|
|`appium:autoDismissAlerts`| Dismiss all iOS alerts automatically if they pop up. This includes privacy access permission alerts (e.g., location, contacts, photos). Default is `false`. |`true` or `false`|

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
|`appium:fullContextList` | Returns the detailed information on contexts for the [get available context](/docs/en/commands/context/get-contexts.md) command. If this capability is enabled, then each item in the returned contexts list would additionally include WebView title, full URL and the bundle identifier. Defaults to `false`. | `true` or `false` |
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
name | Could contain either element's [identifier](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500981-identifier?language=objc) or its [label](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500692-label?language=objc), depending on which one is available first. Could also be `null` | 'hello'
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
enableMultiWindows | boolean | Whether to include all windows that the user can interact with (for example an on-screen keyboard) while building the XML page source (`true`). By default it is `false` and only the single active application window is included to the page source.
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
acceptAlertButtonSelector | string | Allows to customize accept alert button selector. It helps you to handle an arbitrary element as accept button in `accept alert` command. The selector should be a valid [class chain](https://github.com/facebookarchive/WebDriverAgent/wiki/Class-Chain-Queries-Construction-Rules) expression, where the search root is the alert element itself. The default button location algorithm is used if the provided selector is wrong or does not match any element. Example: ```<code>**/XCUIElementTypeButton[\`label CONTAINS[c] 'accept'\`]</code>```
dismissAlertButtonSelector | string | Allows to customize dismiss alert button selector. It helps you to handle an arbitrary element as dismiss button in `dismiss alert` command. The selector should be a valid [class chain](https://github.com/facebookarchive/WebDriverAgent/wiki/Class-Chain-Queries-Construction-Rules) expression, where the search root is the alert element itself. The default button location algorithm is used if the provided selector is wrong or does not match any element. Example: ```<code>**/XCUIElementTypeButton[\`label CONTAINS[c] 'dismiss'\`]</code>```
screenshotOrientation | string | Adjust screenshot orientation for iOS. Appium tries to return a screenshot and adjust its orientation properly using internal heuristics, but sometimes it does not work, especially in landscape mode. The actual screenshot orientation depends on various factors such as OS versions, model versions and whether this is a real or simulator device. This option allows you to enforce the given image orientation. Acceptable values: `auto` (default), `portrait`, `portraitUpsideDown`, `landscapeRight`, `landscapeLeft`.
boundElementsByIndex | boolean | Whether to look up elements with [`allElementsBoundByAccessibilityElement`](https://developer.apple.com/documentation/xctest/xcuielementquery/1500816-allelementsboundbyaccessibilitye) (default) or [`allElementsBoundByIndex`](https://developer.apple.com/documentation/xctest/xcuielementquery/1500945-allelementsboundbyindex). [This Stack Overflow topic](https://stackoverflow.com/questions/49307513/meaning-of-allelementsboundbyaccessibilityelement) explains the differences. Defaults to `false`.
keyboardAutocorrection | boolean | Changes the 'Auto-Correction' preference in _Keyboards_ setting. Defaults to `false`.
keyboardPrediction | boolean | Changes the 'Predictive' preference in _Keyboards_ setting. Defaults to `false`.
nativeWebTap | boolean | See the description of the corresponding capability.
nativeWebTapStrict | boolean | See the description of the corresponding capability.
useJSONSource | boolean | See the description of the corresponding capability.


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
