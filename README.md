# appium-xcuitest-driver

[![NPM version](http://img.shields.io/npm/v/appium-xcuitest-driver.svg)](https://npmjs.org/package/appium-xcuitest-driver)
[![Downloads](http://img.shields.io/npm/dm/appium-xcuitest-driver.svg)](https://npmjs.org/package/appium-xcuitest-driver)
[![Dependency Status](https://david-dm.org/appium/appium-xcuitest-driver.svg)](https://david-dm.org/appium/appium-xcuitest-driver)
[![devDependency Status](https://david-dm.org/appium/appium-xcuitest-driver/dev-status.svg)](https://david-dm.org/appium/appium-xcuitest-driver#info=devDependencies)

[![Build Status](https://api.travis-ci.org/appium/appium-xcuitest-driver.png?branch=master)](https://travis-ci.org/appium/appium-xcuitest-driver)
[![Coverage Status](https://coveralls.io/repos/appium/appium-xcuitest-driver/badge.svg?branch=master)](https://coveralls.io/r/appium/appium-xcuitest-driver?branch=master)



This project has git submodules!

Clone with the `git clone --recursive` flag. Or, after cloning normally run `git submodule init` and then `git submodule update`

The `git diff --submodule` flag is useful here. It can also be set as the default `diff` format: `git config --global diff.submodule log`

`git config status.submodulesummary 1` is also useful.


## External dependencies

In addition to the git submodules mentioned above, this package currently depends
on `libimobiledevice` to do certain things. Install it with [Homebrew](http://brew.sh/),

```
brew install ideviceinstaller
```

There is also a dependency, made necessary by Facebook's [WebDriverAgent](https://github.com/facebook/WebDriverAgent),
for the [Carthage](https://github.com/Carthage/Carthage) dependency manager. If you
do not have Carthage on your system, it can also be installed with
[Homebrew](http://brew.sh/)

```
brew install carthage
```
ideviceinstaller doesn't work with ios 10 yet. So we need to install [ios-deploy]()(https://github.com/phonegap/ios-deploy)

```
npm install -g ios-deploy
```

## Sim Resetting

By default, this driver will create a new iOS simulator and run tests on it, deleting the simulator afterward.

If you specify a specific simulator using the `udid` capability, this driver will boot the specified simulator and shut it down afterwards.

If a udid is provided and the simulator is already running, this driver will leave it running after the test run.

In short, this driver tries to leave things as it found them.

You can use the `noReset` capability to adjust this behavior.
Setting `noReset` to `true` will leave the simulator running at the end of a test session.

## Real devices

The `appium-xcuitest-driver` has provisional support for iOS real devices. Not all functionality is currently supported.

WebDriverAgent needs to be built with `development team` and `provisioning profile` installed on device.

* Open terminal go to `node_modules/appium-xcuitest-driver/WebDriverAgent` (This path is relative to you appium installation).
    ```
    mkdir -p Resources/WebDriverAgent.bundle
    sh ./Scripts/bootstrap.sh -d
  ```

* Open `WebDriverAgent.xcodeproj`. Select your `development team`. This should also auto select `Signing Ceritificate`. This should look like as shown below.

  ![alt WebDriverAgent in Xcode project](https://cloud.githubusercontent.com/assets/12143988/18771980/2dc4f412-80f8-11e6-9ad6-c6883dbf6a03.png)

* Build `WebDriverAgent` once to verify all above steps worked. 
  ```
    xcodebuild -project WebDriverAgent.xcodeproj -scheme WebDriverAgentRunner -destination 'id=<udid>' test

  ```
  Last line on build ouput above command should be `Listening on USB`. Then you are all set!

  Internally it also expects idevicesyslog to be installed. For iOS 10 you need to install it like this `brew install libimobiledevice --HEAD` and for iOS 9 `brew install libimobiledevice`


**Note:** Running WebDriverAgent tests on a real device is particularly flakey. If things stop responding, the only recourse is, most often, to restart the device. Logs in the form of the following _may_ start to occur:

```shell
info JSONWP Proxy Proxying [POST /session] to [POST http://10.35.4.122:8100/session] with body: {"desiredCapabilities":{"ap...
dbug WebDriverAgent Device: Jul 26 13:20:42 iamPhone XCTRunner[240] <Warning>: Listening on USB
dbug WebDriverAgent Device: Jul 26 13:21:42 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - Unable to update application state promptly. <unknown> 0 1
dbug WebDriverAgent Device: Jul 26 13:21:57 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - Failed to get screenshot within 15s <unknown> 0 1
dbug WebDriverAgent Device: Jul 26 13:22:57 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - App state of (null) is still unknown <unknown> 0 1
```

## Usage

Desired Capabilities:

Should be the same for [Appium](https://github.com/appium/appium/blob/master/docs/en/writing-running-appium/caps.md)

Differences noted here

|Capability|Description|Values|
|----------|-----------|------|
|`noReset`|Do not destroy or shut down sim after test. Start tests running on whichever sim is running, or device is plugged in. Default `false`|`true`, `false`|
|`processArguments`|Process arguments and environment which will be sent to the WebDriverAgent server.|`{ args: ["a", "b", "c"] , env: { "a": "b", "c": "d" } }` or `'{"args": ["a", "b", "c"], "env": { "a": "b", "c": "d" }}'`|
|`wdaLocalPort`|This value if specified, will be used to forward traffic from Mac host to real ios devices over USB. Default value is same as port number used by WDA on device.|e.g., `8100`|
|`showXcodeLog`|Whether to display the output of the Xcode command used to run the tests. If this is `true`, there will be **lots** of extra logging at startup. Defaults to `false`|e.g., `true`|
|`realDeviceLogger`|Device logger for real devices. It could be path to `deviceconsole` (You can install `npm install deviceconsole`. A compiled binary named `deviceconsole` will be added to `./node_modules/deviceconsole/`.) or `idevicesyslog` (This comes with libimobiledevice)|`idevicesyslog`, `/abs/path/to/deviceconsole`|

## Watch

```
npm run watch
```


## Test

```
npm test
```


## WebDriverAgent Updating

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
