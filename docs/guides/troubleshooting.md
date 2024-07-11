---
title: Troubleshooting
---

## Known Problems

* Real devices with iOS/iPadOS 15+ show an overlay with the text `Automation Running Hold both
  volume buttons to stop` while WebDriverAgent is running. This is a known limitation of the XCTest
  framework. Note that screenshotting functionality is not affected (i.e. the overlay is not visible
  on taken screenshots).
* Real devices with iOS/iPadOS 15+ [require passcode or Touch ID](https://github.com/appium/appium/issues/15898#issuecomment-927340411)
  when starting a new session. A workaround for this is to disable passcode/Touch ID on the device.
* After many failures on a real device, it could transition to a state where connections are no
  longer being accepted. Rebooting the device can help remedy this problem. Please read
  [this issue](https://github.com/facebook/WebDriverAgent/issues/507) for more details.
* `shake` is implemented via AppleScript and works only on Simulator due to lack of support from Apple

## Interact with dialogs managed by `com.apple.springboard`

System dialogs, such as permission dialogs, might not be interactable directly when the active application is not `com.apple.springboard`.
Despite a similar look, dialogs belonging to the active session application (e.g. initially passed as `appium:app` or `appium:bundleId` capability value)
do not require such adjustment.

XCUITest driver offers a couple of approaches to handle them:

- Set the [respectSystemAlerts setting](../reference/settings.md) to `true`. It enforces the active application
  detection algorithm to check a presence of system alerts and to return the Springboard app if this check succeeds.
  Such approach emulates the driver behavior prior to version 6 of XCUITest driver, although it might slightly
  slow down your scripts because each attempt to detect an active app would require to also query for alerts
  presence.
- Start a session without `appium:app` nor `appium:bundleId`. Then XCUITest driver attempts to get the current active application. This requires you to start an application after a new session request with [`mobile: installApp`](../reference/execute-methods.md#mobile-installapp) to install an app if needed and [`mobile: launchApp`](../reference/execute-methods.md#mobile-launchapp)/[`mobile: activateApp`](../reference/execute-methods.md#mobile-activateapp), but it could automatically change the active application with `com.apple.springboard` or activate an application at the foreground. (Note that the automatic app detection might be lengthy, thus each action could take more time.)
    - When a permission alert exists at the foreground, it could select the `com.apple.springboard`
    - When another application is at the foreground by accepting/denying the system alert, or [`mobile: activateApp`](../reference/execute-methods.md#mobile-activateapp), the application would be selected as an active application.
- [`mobile: alert`](../reference/execute-methods.md#mobile-alert)
- `defaultActiveApplication` setting in [Settings](../reference/settings.md).
    - e.g. With the [Appium Ruby client](https://github.com/appium/ruby_lib_core)
        ```ruby
        # Interacting with the test target
        driver.settings.update({defaultActiveApplication: "com.apple.springboard"})
        # to accept the alert
        driver.find_element("accessibility_id", "Allow Once").click
        driver.settings.update({defaultActiveApplication: "auto"})
        # keep interacting with the test target
        ```
- Enable `appium:autoAcceptAlerts`/`appium:autoDismissAlerts`, or interact with alerts via [User Prompts](https://www.w3.org/TR/webdriver1/#user-prompts) in WebDriver endpoints
    - e.g. `driver.switch_to.alert.accept` with the [Appium Ruby client](https://github.com/appium/ruby_lib_core)
    - It might be necessary to coordinate element selection via `acceptAlertButtonSelector`/`dismissAlertButtonSelector` settings in [Settings](../reference/settings.md)
- Activate `com.apple.springboard` with [`mobile: activateApp`](../reference/execute-methods.md#mobile-activateapp) before interacting with dialogs

[`mobile: activeAppInfo`](../reference/execute-methods.md#mobile-activateappinfo) helps to understand what application (bundleId) is considered as active for the XCUITest driver.

## Leftover Application Data on Real Devices

There might be a situation where application data is present on the real device, even if the
application itself is not installed. This could happen if:

- The app is in an [offloaded state](https://discussions.apple.com/thread/254887240)
- The application state is cached
- There was an unexpected failure while installing the app. An example of such failure is the
  `ApplicationVerificationFailed` which happens while installing an app signed with an invalid provisioning profile.

In the above cases, the application identifier will not be listed in the output of
[`mobile: listApps`](../reference/execute-methods.md#mobile-listapps), and it will not be detected
by [`mobile: isAppInstalled`](../reference/execute-methods.md#mobile-isappinstalled). Setting
`appium:fullReset` or `appium:enforceAppInstall` capabilities to `true` also will not help clear this data.

The only way to completely get rid of the cached application data is to call the
[`mobile: removeApp`](../reference/execute-methods.md#mobile-removeapp) command with the appropriate
bundle identifier.

The driver does automatically try to resolve application installs that failed because of the
`MismatchedApplicationIdentifierEntitlement` error. However, in cases when the previously installed
application's provisioning profile is different from what currently the driver is trying to
install, and if you explicitly set the driver to _not_ perform application uninstall, then consider
calling [`mobile: removeApp`](../reference/execute-methods.md#mobile-removeapp) before the
`MismatchedApplicationIdentifierEntitlement` error occurs. Example steps can be as follows:

1. Start a session without `appium:app` and `appium:bundleId` capabilities
2. Call [`mobile: removeApp`](../reference/execute-methods.md#mobile-removeapp) for the target
   application's bundle id
3. Install the test target with [`mobile: installApp`](../reference/execute-methods.md#mobile-installapp)
4. Launch the application with [`mobile: launchApp`](../reference/execute-methods.md#mobile-launchapp)
   or [`mobile: activateApp`](../reference/execute-methods.md#mobile-activateapp)

## Weird State

### Real Device Stops Responding

Running tests on a real device is particularly flakey. If things stop responding, the only recourse
is, most often, to restart the device. Logs in the form of the following _may_ start to occur:

```shell
info JSONWP Proxy Proxying [POST /session] to [POST http://10.35.4.122:8100/session] with body: {"desiredCapabilities":{"ap..."
dbug WebDriverAgent Device: Jul 26 13:20:42 iamPhone XCTRunner[240] <Warning>: Listening on USB
dbug WebDriverAgent Device: Jul 26 13:21:42 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - Unable to update application state promptly. <unknown> 0 1
dbug WebDriverAgent Device: Jul 26 13:21:57 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - Failed to get screenshot within 15s <unknown> 0 1
dbug WebDriverAgent Device: Jul 26 13:22:57 iamPhone XCTRunner[240] <Warning>: Enqueue Failure: UI Testing Failure - App state of (null) is still unknown <unknown> 0 1
```

### Command Takes 60+ Seconds

Sometimes it is possible to encounter slowdowns for an additional 60 seconds for a command that
usually should not take long. This may be caused by a crash in the `testmanagerd` process on the
device under test. In such case, the OS tries to restore the process, then wait for the resurrected
daemon to connect to the target process, which causes the aforementioned delay.

This can be fixed by terminating the target application process. For example, if this behavior
occurs while calling `mobile: queryAppState`, you can terminate the application once, or restart the
device entirely. Please check [this pull request](https://github.com/appium/WebDriverAgent/pull/774)
for more details.

## Real Device Security Settings

On some systems, especially CI ones, where tests are executed by command line agents, macOS
Accessibility restrictions result in the WebDriverAgent process being unable to retrieve the
development keys from the system keychain. This usually manifests by `xcodebuild` returning error
code `65`. One workaround for this is to use a private key that is not stored on the system
keychain. See [this issue](https://github.com/appium/appium/issues/6955) and
[this Stack Exchange post](http://stackoverflow.com/questions/16550594/jenkins-xcode-build-works-codesign-fails).

To export the key, use

```
security create-keychain -p [keychain_password] MyKeychain.keychain
security import MyPrivateKey.p12 -t agg -k MyKeychain.keychain -P [p12_Password] -A
```

where `MyPrivateKey.p12` is the private development key exported from the system keychain.

You can then use the [`appium:keychainPath`](../reference/capabilities.md#webdriveragent) and
[`appium:keychainPassword`](../reference/capabilities.md#webdriveragent) capabilities to pass this
keychain to WebDriverAgent.

## Simulator Resetting

When testing on simulators, the driver tries to leave the simulator state as it found it:

* If no `udid` is provided, the driver will create a new iOS simulator, run tests on it, and then
  delete the simulator
* If a specific `udid` is provided for a simulator that _is not_ running, the driver will boot the
  specified simulator, run tests on it, and then shut the simulator down
* If a specific `udid` is provided for a simulator that _is_ running, the driver will connect to the
  existing simulator, run tests, and then leave the simulator running

You can use the `appium:noReset` capability to adjust this behavior: setting it to `true` will
leave the simulator running at the end of a test session.

## Caching Issues During Build

Testing on iOS generates files that can sometimes get large. These include logs, temporary files,
and derived data from Xcode runs, all of which are safe to delete if any issues arise. The files are
usually found in the following locations, should they need to be deleted:

```
$HOME/Library/Logs/CoreSimulator/*
$HOME/Library/Developer/Xcode/DerivedData/*
```

## A gesture, like scroll or swipe, does not have any effect / It is unclear how to do it

The XCUITest driver provides multiple options for touch gestures automation.
For simple gestures, like tap by coordinates, long tap, multi-finger tap, double/triple tap,
swipe, drag, rotate, scroll or pinch use the below gesture shortcuts:

- [mobile: tap](../reference/execute-methods.md#mobile-tap)
- [mobile: doubleTap](../reference/execute-methods.md#mobile-doubletap)
- [mobile: touchAndHold](../reference/execute-methods.md#mobile-touchandhold)
- [mobile: twoFingerTap](../reference/execute-methods.md#mobile-twofingertap)
- [mobile: dragFromToForDuration](../reference/execute-methods.md#mobile-dragfromtoforduration)
- [mobile: dragFromToWithVelocity](../reference/execute-methods.md#mobile-dragfromtowithvelocity)
- [mobile: rotateElement](../reference/execute-methods.md#mobile-rotateelement)
- [mobile: tapWithNumberOfTaps](../reference/execute-methods.md#mobile-tapwithnumberoftaps)
- [mobile: forcePress](../reference/execute-methods.md#mobile-forcepress)
- [mobile: scrollToElement](../reference/execute-methods.md#mobile-scrolltoelement)
- [mobile: scroll](../reference/execute-methods.md#mobile-scroll)
- [mobile: pinch](../reference/execute-methods.md#mobile-pinch)

For more sophisticated gestures
consider using [W3C actions](https://w3c.github.io/webdriver/#actions).

Make sure you don't use deprecated JWP touch actions APIs. They have been
removed from the XCUITest driver since version 7.

If the action code in the client source looks good and satisfies the above requirements,
but its execution still does not deliver the expected result then the following debugging
measures might be applied:

- Make sure the gesture has valid coordinates and respects pauses between pointer state changes.
  For example, it is always mandatory to provide a valid element or valid `absolute` coordinates
  to any gesture at the beginning. iOS only registers
  a long touch/click if the pointer has been depressed for longer than 500ms. For shorter actions
  a simple click is registered instead.
- If your tests run on Simulator then it is possible to activate pointer tracing by enabling
  the [appium:simulatorTracePointer](../reference/capabilities.md#simulator) capability or by enabling
  `Visual Indicators` items from Simulator settings. After running
  your automation code with this feature enabled you would be able to see the exact pointer trace path
  and check the velocity of the gesture. Compare the trace
  to how the same gesture is usually done manually and apply the necessary updates to your code.
- Do not mix webview and native elements in actions arguments. It simply won't work. Native
  actions could only consume native elements. A single possibility to perform a native action
  on a web element would be to translate its coordinates into the native context and pass these
  coordinates as native action arguments.

Check the below tutorials for more details on how to build reliable action chains:

- [Automating Complex Gestures with the W3C Actions API](https://appiumpro.com/editions/29-automating-complex-gestures-with-the-w3c-actions-api)
- [Swiping your way through Appium by Wim Selles #AppiumConf2021](https://www.youtube.com/watch?v=oAJ7jwMNFVU)
- [About iOS Input Events](./input-events.md)
