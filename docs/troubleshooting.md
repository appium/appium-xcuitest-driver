---
title: Troubleshooting
---

## Known problems

- After many failures on real devices it could transition to a state where connections are no longer being accepted. To possibly remedy this issue reboot the device. Read https://github.com/facebook/WebDriverAgent/issues/507 for more details.
- iPhone/iPad real devices show overlay, which has `Automation Running Hold both volume buttons to stop` text, since iOS/iPadOS 15. This is a known limitation of XCTest framework. This limitation does not affect screenshooting APIs though (e.g. the overlay is not visible on taken screenshots).
- iPhone/iPad real devices [require passcode or touch id](https://github.com/appium/appium/issues/15898#issuecomment-927340411) when they start a XCTest session since iOS/iPadOS 15. Disabling passcode/touch id in the device preference allows to workaround the behaviour above.
- OpenSSL v3 breaks secure communication with real devices. It can cause a [Failed to receive any data within the timeout](https://github.com/appium/appium/issues/16399) error in [appium-ios-device](https://github.com/appium/appium-ios-device). Please read [this issue](https://github.com/appium/appium-ios-device/pull/88#discussion_r825315862) for more details.
    - Please make sure your environment has Open SSL v1 for NodeJS environment, or prepare an OpenSSL v3 build by patching `OPENSSL_TLS_SECURITY_LEVEL=1`. (e.g. [an article](https://www.feistyduck.com/library/openssl-cookbook/online/ch-openssl.html))
    - This configuration is only necessary for XCUITest driver v4.3.0 or lower.
* `shake` is implemented via AppleScript and works only on Simulator due to lack of support from Apple


## Clear the application local data explicitly for real devices

iOS real device could have a situation that has application data locally but the application package is not on the device. It can occur an [offload application](https://discussions.apple.com/thread/254887240) state, cached application state or when an application installation fails. An example of the installation failure is `ApplicationVerificationFailed` by invalid provisioning profile.

Under the situation, the application will not listed in the result of [mobile: listApps](execute-methods.md#mobile-listapps) and installed application check such as [mobile: isAppInstalled](execute-methods.md#mobile-isappinstalled).

`appium:fullReset` or `appium:enforceAppInstall` capability may also not uninstall such offload application state in a new session request.
It indicates if the device under test already has such a application's local data, the local data will remain.

To clear the application local data completely even in such an offload application state, you should explicitly uninstall the application with [`mobile: removeApp`](execute-methods.md#mobile-removeapp).

For example, a session need to start without `appium:app` and `appium:bundleId`, then uninstall the bundle id explicitly with [`mobile: removeApp`](execute-methods.md#mobile-removeapp)
before installing a new application with [`mobile: installApp`](execute-methods.md#mobile-installapp).

## Weird state

### stop responding
**Note:** Running `WebDriverAgent` tests on a real device is particularly flakey. If things stop responding, the only recourse is, most often, to restart the device. Logs in the form of the following _may_ start to occur:

```shell
info JSONWP Proxy Proxying [POST /session] to [POST http://10.35.4.122:8100/session] with body: {"desiredCapabilities":{"ap..."
dbug WebDriverAgent Device: Jul 26 13:20:42 iamPhone XCTRunner[240] <Warning>: Listening on USB
dbug WebDriverAgent Device: Jul 26 13:21:42 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - Unable to update application state promptly. <unknown> 0 1
dbug WebDriverAgent Device: Jul 26 13:21:57 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - Failed to get screenshot within 15s <unknown> 0 1
dbug WebDriverAgent Device: Jul 26 13:22:57 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - App state of (null) is still unknown <unknown> 0 1
```

### Get a response after 60+ seconds after a session starts frequently

Did you experience an additional 60 seconds of slow command response that usually should not take long?


It might be that the `testmanagerd` process on the device under test has crashed. In such case, the OS tries to restore it causing the above delay while waiting for the resurrected daemon is connecting to the target process.
This can be fixed by terminating the target application process. For example, if this behavior occurs in `mobile: queryAppState` command call, you could terminate the application once, or restart the device entirely.

Please check [WebDriverAgent#774 pull request](https://github.com/appium/WebDriverAgent/pull/774) for more details.

## Real device security settings

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


## Simulator Resetting

By default, this driver will create a new iOS simulator and run tests on it, deleting the simulator afterward.

If you specify a specific simulator using the `udid` capability, this driver will boot the specified simulator and shut it down afterwards.

If a udid is provided and the simulator is already running, this driver will leave it running after the test run.

In short, this driver tries to leave things as it found them.

You can use the `noReset` capability to adjust this behavior.
Setting `noReset` to `true` will leave the simulator running at the end of a test session.

## Delete files generated by test runs to avoid possible caching issue

Testing on iOS generates files that can sometimes get large. These include logs, temporary files, and derived data from Xcode runs. Generally the following locations are where they are found, should they need to be deleted:

```
$HOME/Library/Logs/CoreSimulator/*
$HOME/Library/Developer/Xcode/DerivedData/*
```
