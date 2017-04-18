# appium-xcuitest-driver

[![NPM version](http://img.shields.io/npm/v/appium-xcuitest-driver.svg)](https://npmjs.org/package/appium-xcuitest-driver)
[![Downloads](http://img.shields.io/npm/dm/appium-xcuitest-driver.svg)](https://npmjs.org/package/appium-xcuitest-driver)
[![Dependency Status](https://david-dm.org/appium/appium-xcuitest-driver.svg)](https://david-dm.org/appium/appium-xcuitest-driver)
[![devDependency Status](https://david-dm.org/appium/appium-xcuitest-driver/dev-status.svg)](https://david-dm.org/appium/appium-xcuitest-driver#info=devDependencies)

[![Build Status](https://api.travis-ci.org/appium/appium-xcuitest-driver.png?branch=master)](https://travis-ci.org/appium/appium-xcuitest-driver)
[![Coverage Status](https://coveralls.io/repos/appium/appium-xcuitest-driver/badge.svg?branch=master)](https://coveralls.io/r/appium/appium-xcuitest-driver?branch=master)

*Note*: Issue tracking for this repo has been disabled. Please use the [main Appium issue tracker](https://github.com/appium/appium/issues) instead.

## Missing functionality

* Setting geo location (https://github.com/appium/appium/issues/6856)
* Auto accepting/dismissing alerts (https://github.com/appium/appium/issues/6863)
* Touch Actions

## Known issues

* Unable to interact with elements on devices in Landscape mode (https://github.com/appium/appium/issues/6994)
* `shake` is not implemented due to lack of support from Apple
* `lock` is not implemented due to lack of support from Apple
* Setting geo-location not supported due to lack of support from Apple
* Through multi action API, `zoom` works but `pinch` does not, due to Apple issue.


## External dependencies

In addition to the git submodules mentioned below (see [Development](#development)), this package currently depends
on `libimobiledevice` to do certain things. Install it with [Homebrew](http://brew.sh/),

```
brew install libimobiledevice --HEAD  # install from HEAD to get important updates
brew install ideviceinstaller         # only works for ios 9. for ios 10, see below
```

There is also a dependency, made necessary by Facebook's [WebDriverAgent](https://github.com/facebook/WebDriverAgent),
for the [Carthage](https://github.com/Carthage/Carthage) dependency manager. If you
do not have Carthage on your system, it can also be installed with
[Homebrew](http://brew.sh/)

```
brew install carthage
```

`ideviceinstaller` doesn't work with iOS 10 yet. So we need to install [ios-deploy](https://github.com/phonegap/ios-deploy)

```
npm install -g ios-deploy
```

For real devices we can use [xcpretty](https://github.com/supermarin/xcpretty) to make Xcode output more reasonable. This can be installed by

```
gem install xcpretty
```


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

After many failures on real devices, there can be a state where the device will no longer accept connections. To possibly remedy this, set the `useNewWDA` capability to `true`.

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

Differences noted here

|Capability|Description|Values|
|----------|-----------|------|
|`noReset`|Do not destroy or shut down sim after test. Start tests running on whichever sim is running, or device is plugged in. Default `false`|`true`, `false`|
|`processArguments`|Process arguments and environment which will be sent to the WebDriverAgent server.|`{ args: ["a", "b", "c"] , env: { "a": "b", "c": "d" } }` or `'{"args": ["a", "b", "c"], "env": { "a": "b", "c": "d" }}'`|
|`wdaLocalPort`|This value if specified, will be used to forward traffic from Mac host to real ios devices over USB. Default value is same as port number used by WDA on device.|e.g., `8100`|
|`showXcodeLog`|Whether to display the output of the Xcode command used to run the tests. If this is `true`, there will be **lots** of extra logging at startup. Defaults to `false`|e.g., `true`|
|`iosInstallPause`|Time in milliseconds to pause between installing the application and starting WebDriverAgent on the device. Used particularly for larger applications. Defaults to `0`|e.g., `8000`|
|`xcodeOrgId`|Apple developer team identifier string. Must be used in conjunction with `xcodeSigningId` to take effect.|e.g., `JWL241K123`|
|`xcodeSigningId`|String representing a signing certificate. Must be used in conjunction with `xcodeOrgId`. This is usually just `iPhone Developer`, so the default (if not included) is `iPhone Developer`|e.g., `iPhone Developer`|
|`xcodeConfigFile`|Full path to an optional Xcode configuration file that specifies the code signing identity and team for running the WebDriverAgent on the real device.|e.g., `/path/to/myconfig.xcconfig`|
|`updatedWDABundleId`|Bundle id to update WDA to before building and launching on real devices. This bundle id _must_ be associated with a valid provisioning profile.|e.g., `io.appium.WebDriverAgentRunner`|
|`keychainPath`|Full path to the private development key exported from the system keychain. Used in conjunction with `keychainPassword` when testing on real devices.|e.g., `/path/to/MyPrivateKey.p12`|
|`keychainPassword`|Password for unlocking keychain specified in `keychainPath`.|e.g., `super awesome password`|
|`scaleFactor`|Simulator scale factor. This is useful to have if the default resolution of simulated device is greater than the actual display resolution. So you can scale the simulator to see the whole device screen without scrolling. |Acceptable values are: `'1.0', '0.75', '0.5', '0.33' and '0.25'`. The value should be a string.|
|`usePrebuiltWDA`|Skips the build phase of running the WDA app. Building is then the responsibility of the user. Only works for Xcode 8+. Defaults to `false`.|e.g., `true`|
|`preventWDAAttachments`|Sets read only permissions to Attachments subfolder of WebDriverAgent root inside Xcode's DerivedData. This is necessary to prevent XCTest framework from creating tons of unnecessary screenshots and logs, which are impossible to turn off using programming interfaces provided by Apple.|Setting the capability to `true` will set Posix permissions of the folder to `555` and `false` will reset them back to `755`. `true` by default|
|`webDriverAgentUrl`|If provided, Appium will connect to an existing WebDriverAgent instance at this URL instead of starting a new one.|e.g., `http://localhost:8100`|
|`useNewWDA`|If `true`, forces uninstall of any existing WebDriverAgent app on device. This can provide stability in some situations. Defaults to `false`.|e.g., `true`|
|`wdaLaunchTimeout`|Time, in ms, to wait for WebDriverAgewnt to be pingable. Defaults to 60000ms.|e.g., `30000`|
|`wdaConnectionTimeout`|Timeout, in ms, for waiting for a response from WebDriverAgent. Defaults to 240000ms.|e.g., `1000`|
|`resetOnSessionStartOnly`|Whether to perform reset on test session finish (`false`) or not (`true`). Keeping this variable set to `true` and Simulator running (the default behaviour since version 1.6.4) may significantly shorten the duratiuon of test session initialization.|Either `true` or `false`. Defaults to `true`|
|`commandTimeouts`|Custom timeout(s) in milliseconds for WDA backend commands execution. This might be useful if WDA backend freezes unexpectedly or requires too much time to fail and blocks automated test execution. The value is expected to be of type string and can either contain max milliseconds to wait for each WDA command to be executed before terminating the session forcefully or a valid JSON string, where keys are internal Appium command names (you can find these in logs, look for "Executing command 'command_name'" records) and values are timeouts in milliseconds. You can also set the 'default' key to assign the timeout for all other commands not explicitly enumerated as JSON keys.|`'120000'`, `'{"findElement": 40000, "findElements": 40000, "setValue": 20000, "default": 120000}'`|
|`wdaStartupRetries`|Number of times to try to build and launch WebDriverAgent onto the device. Defaults to 2.|e.g., `4`|
|`wdaStartupRetryInterval`|Time, in ms, to wait between tries to build and launch WebDriverAgent. Defaults to 10000ms.|e.g., `20000`|
|`connectHardwareKeyboard`|Set this option to `true` in order to enable hardware keyboard in Simulator. It is set to `false` by default, because this helps to workaround some XCTest bugs.|`true` or `false`|
|`maxTypingFrequency`|Maximum frequency of keystrokes for typing and clear. If your tests are failing because of typing errors, you may want to adjust this. Defaults to 60 keystrokes per minute.|e.g., `30`|
|`simpleIsVisibleCheck`|Use native methods for determining visibility of elements. In some cases this takes a long time. Setting this capability to `false` will cause the system to use the position and size of elements to make sure they are visible on the screen. This can, however, lead to false results in some situations. Defaults to `false`, except iOS 9.3, where it defaults to `true`.|e.g., `true`, `false`|
|`useCarthageSsl`|Use SSL to download dependencies for WebDriverAgent. Defaults to `false`|e.g., `true`|
|`shouldUseSingletonTestManager`|Use default proxy for test management within WebDriverAgent. Setting this to `false` sometimes helps with socket hangup problems. Defaults to `true`.|e.g., `false`|
|`startIWDP`|Set this to `true` if you want to start ios_webkit_debug proxy server automatically for accessing webviews on iOS. The capatibility only works for real device automation. Defaults to `false`.|e.g., `true`|
|`allowTouchIdEnroll`|Set this to `true` if you want to enroll simulator for touch id. Defaults to `false`.|e.g., `true`|


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
