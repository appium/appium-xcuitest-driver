---
title: iPhone Duo Automation
---

The XCUITest driver supports testing on the iPhone Duo simulator, including requesting fold and
unfold transitions. Duo sessions use `platformName: iOS` and the standard iOS element and gesture
commands.

## Requirements

* A macOS host with Xcode and an installed iOS Simulator runtime that includes iPhone Duo
* XCUITest driver 12.17.0 or later

Follow the [installation guide](../getting-started/installation.md) to install the driver. If you
provide your own prebuilt or preinstalled WebDriverAgent (WDA), it must also include support for
the hinge angle commands and the `currentDisplayId` setting. Using an older WDA with a newer
driver does not add that support.

## Simulator Setup

1. Select an Xcode installation that provides the Duo simulator. See
   [Managing Multiple Xcode Versions](./multiple-xcode-versions.md) if you have more than one
   Xcode installation.
2. Install a compatible iOS Simulator runtime and create an iPhone Duo simulator in Xcode.
3. Find the simulator's name and OS version:

    ```bash
    xcrun simctl list devices available
    ```

4. Start the Appium server:

    ```bash
    appium
    ```

5. Start a session with the following capabilities, replacing the placeholders with the values
   from step 3 and the path to your simulator application:

    ```json
    {
        "platformName": "iOS",
        "appium:automationName": "XCUITest",
        "appium:deviceName": "iPhone Duo",
        "appium:platformVersion": "<installed-ios-version>",
        "appium:app": "/absolute/path/to/YourApp.app"
    }
    ```

    Use the simulator's actual name if you renamed it. `appium:udid` is optional for simulators;
    the driver can select a simulator using `appium:deviceName` and `appium:platformVersion`.
    To target a specific simulator, add `appium:udid` with its UDID from step 3.

    The application must be built for the iOS
    Simulator. To test an already-installed app, replace `appium:app` with
    `appium:bundleId` containing its bundle identifier.

The default startup flow builds and launches WDA. You can also use
[preinstalled WDA](./run-preinstalled-wda.md); Duo simulator startup support for this flow was
added in driver 12.15.0. RemoteXPC tunnels are not required for simulator sessions.

## Session Actions

### Select a Display

Duo has multiple displays. Use the
[`currentDisplayId` setting](../reference/settings.md#currentdisplayid) to select the display
for screenshots and W3C touch actions. Folding or unfolding does not update this setting, and
the main display is not necessarily the one visible in the current fold state.

While the session is running, list the available displays with
[`mobile: getScreens`](../reference/execute-methods.md#mobile-getscreens):

=== "JS (WebdriverIO)"

    ```javascript
    const screens = await driver.execute('mobile: getScreens');
    console.log(screens);
    ```

=== "Python"

    ```python
    screens = driver.execute_script('mobile: getScreens')
    print(screens)
    ```

The returned array contains each screen's `displayId`, `isMain`, `bounds`, `scale`, and `traits`.
Choose the display you intend to test using this information and a screenshot;
do not assume fixed IDs for the inner and outer displays or select by array position.

Set the chosen ID through Appium's Settings API. In these examples, replace `3` with the
integer `displayId` returned for your target display:

=== "JS (WebdriverIO)"

    ```javascript
    const targetDisplayId = 3; // Replace with your target display's ID.
    await driver.updateSettings({currentDisplayId: targetDisplayId});
    await driver.saveScreenshot('./duo-selected-display.png');
    ```

=== "Python"

    ```python
    target_display_id = 3  # Replace with your target display's ID.
    driver.update_settings({'currentDisplayId': target_display_id})
    driver.save_screenshot('./duo-selected-display.png')
    ```

After changing the fold state, call `mobile: getScreens` again and update the selection as needed before
interacting with the app or capturing it. Wait for the expected layout and keep the fold state
and display selection stable while a gesture runs. For W3C actions with an element origin, the
selected display must match the element's display.

To restore the main display, use `await driver.updateSettings({currentDisplayId: null})` in
WebdriverIO or `driver.update_settings({'currentDisplayId': None})` in Python. This restores
main-display selection; it does not enable automatic switching to the visible display.

When a display is explicitly selected, screenshots use WDA through the driver and do not fall
back to a simulator screenshot of the main display. After the selection changes, screenshots
also bypass cached MJPEG frames for the remainder of the session, including after resetting to
`null`. This avoids capturing a frame left over from the previous display.

### Change the Hinge Angle

Use standard element lookup, click, and [gesture commands](./gestures.md) to interact with your
app. To exercise its layout across fold states, use
[`mobile: setSimulatedHingeAngle`](../reference/execute-methods.md#mobile-setsimulatedhingeangle)
and [`mobile: getSimulatedHingeAngle`](../reference/execute-methods.md#mobile-getsimulatedhingeangle).

| Angle | Requested state |
| --- | --- |
| `0` | Fully closed |
| `90` | Partially open |
| `180` | Fully open |

Fractional angles between `0` and `180` are also accepted. Folding completes asynchronously:
wait for the expected application layout before interacting with elements or taking screenshots.
A successful set command does not guarantee that the requested angle was applied, and a reading
during a transition can return an intermediate angle.

The examples below assume an active session and the expanded layout's display ID obtained as
described above (`targetDisplayId` in JavaScript or `target_display_id` in Python).
Replace `expanded-layout` with an accessibility identifier that your app exposes when its
expanded layout is ready.

=== "JS (WebdriverIO)"

    ```javascript
    await driver.execute('mobile: setSimulatedHingeAngle', {angle: 180});
    await driver.updateSettings({currentDisplayId: targetDisplayId});
    await driver.$('~expanded-layout').waitForDisplayed({timeout: 10000});
    const angle = await driver.execute('mobile: getSimulatedHingeAngle');
    console.log(`Current hinge angle: ${angle}`);
    await driver.saveScreenshot('./duo-expanded.png');
    ```

=== "Python"

    ```python
    from appium.webdriver.common.appiumby import AppiumBy
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.webdriver.support.ui import WebDriverWait

    driver.execute_script('mobile: setSimulatedHingeAngle', {'angle': 180})
    driver.update_settings({'currentDisplayId': target_display_id})
    WebDriverWait(driver, 10).until(
        EC.visibility_of_element_located((AppiumBy.ACCESSIBILITY_ID, 'expanded-layout'))
    )
    angle = driver.execute_script('mobile: getSimulatedHingeAngle')
    print(f'Current hinge angle: {angle}')
    driver.save_screenshot('./duo-expanded.png')
    ```

Repeat with `angle: 0` or `angle: 90` and the corresponding layout checks to test closed and
partially open states. Re-read element bounds after each transition instead of reusing coordinates
from the previous layout.

## Known Limitations

* Duo automation has been verified only on the simulator, not on real Duo devices. We welcome
  feedback from real-device testing, including whether hinge angle reading and simulated hinge
  angle changes work. Please share your findings in
  [WebDriverAgent PR #1287](https://github.com/appium/WebDriverAgent/pull/1287).
  For real-device preparation, see [Real Device Setup](../getting-started/device-setup.md#real-devices).
* Hinge support is checked by WDA at runtime. Devices without an available hinge return an error.
* Setting the hinge angle does not change device orientation or the `currentDisplayId` setting.
  See [Select a Display](#select-a-display) for display selection examples.
* Reading the hinge angle can take up to five seconds and fails if no valid reading arrives.

## Related Tickets

* [Duo WDA startup support](https://github.com/appium/appium-xcuitest-driver/pull/3000)
* [Simulated hinge angle commands](https://github.com/appium/appium-xcuitest-driver/pull/3001)
* [WDA hinge angle support and real-device feedback](https://github.com/appium/WebDriverAgent/pull/1287)
