---
title: tvOS Automation
---

The XCUITest driver supports automation of the tvOS platform. The driver is compatible not only
with simulators, but also with real wired and wireless devices.

## Real Device Setup

Similarly to real iOS/iPadOS devices, real tvOS devices also have several additional prerequisites.
Refer to the [Real Device Setup](../getting-started/device-setup.md#real-devices) document for
details.

## Environment Setup

Real wireless devices have a few environment requirements that depend on the tvOS version. These
requirements do not apply to simulators and real wired devices.

| <div style="width:6em">tvOS Version</div> | Requirements |
| --- | --- |
| >= 18 | The device must have an active RemoteXPC tunnel (see [RemoteXPC guide](./remotexpc-tunnels-real-devices.md) for details) |
| 17 | The Appium server must be launched with the `APPIUM_XCUITEST_PREFER_DEVICECTL=1` flag (see [Environment Variables](../reference/env-vars.md) for more details). This may not be needed if your environment exposes the `usbmuxd` interface to Appium via third-party tools. |
| <= 16 | No additional requirements |

## Session Creation

You can run tests for tvOS by setting the `platformName` capability to `tvOS`:

```json
{
    "platformName": "tvOS", // here
    "appium:automationName": "XCUITest",
    "appium:platformVersion": "18.5",
    "appium:deviceName": "Apple TV",
    ...
}
```

Real wireless devices running tvOS 17 must also pass the `appium:wdaBaseUrl` capability, which must
be set to the Apple TV's IP address:

```json
{
    "platformName": "tvOS",
    "appium:automationName": "XCUITest",
    "appium:platformVersion": "17.4",
    "appium:deviceName": "Apple TV",
    "appium:wdaBaseUrl": "http://<apple-tv-ip-address>",
    ...
}
```

## Session Actions

tvOS supports [remote controller](https://developer.apple.com/design/human-interface-guidelines/tvos/remote-and-controllers/remote/)
based actions. The XCUITest driver implements these actions using the
[`mobile: pressButton`](../reference/execute-methods.md#mobile-pressbutton) extension, with support
for over 10 different buttons. The `menu` button functions as a back button in the iOS context.

All actions are performed on the _focused_ element (which has the `focus` attribute set). The
focused element is automatically changed after using `mobile: pressButton`.

It is also possible to use the standard `findElement` and `click` methods. The XCUITest driver will
automatically calculate the necessary sequence of `up/down/left/right` and `select` button presses,
so you should not care about which keys should be pressed to reach an arbitrary element every time.

You may want to consider using `wait` methods, since tvOS also has animation.

Here are a few example action sequences in different client languages:

=== "Java"

    ```java
    WebElement element = driver.findElementByAccessibilityId("element on the app");
    element.getAttribute("focused");
    element.click();
    driver.queryAppState("test.package.name");
    driver.executeScript("mobile: pressButton", ImmutableMap.of("name", "Home"));
    driver.executeScript("mobile: pressButton", ImmutableMap.of("name", "Up"));
    element = driver.switchTo().activeElement();
    element.getAttribute("label");
    ```

=== "JS (WebdriverIO)"

    ```javascript
    const element = $('element on the app');
    element.getAttribute('focused');
    element.click();
    driver.queryAppState("test.package.name");
    driver.execute('mobile: pressButton', {name: 'Home'});
    driver.execute('mobile: pressButton', {name: 'Up'});
    const activeElement = driver.getActiveElement();
    activeElement.getAttribute('label');
    ```

=== "Python"

    ```Python
    element = driver.find_element_by_accessibility_id('element on the app')
    element.get_attribute('focused')
    element.click()
    driver.query_app_state('test.package.name')
    driver.execute_script('mobile: pressButton', { 'name': 'Home' })
    driver.execute_script('mobile: pressButton', { 'name': 'Up' })
    element = driver.switch_to.active_element
    element.get_attribute('label')
    ```

=== "Ruby"

    ```ruby
    element = @driver.find_element :accessibility_id, 'element on the app'
    element.focused
    element.click
    @driver.app_state('test.package.name')
    @driver.execute_script 'mobile: pressButton', { name: 'Home' }
    @driver.execute_script 'mobile: pressButton', { name: 'Up' }
    element = @driver.switch_to.active_element
    element.label
    ```

## Known Limitations

* Gesture commands do not work
* Certain commands such as pasteboard do not work

## Related Tickets

* <https://github.com/appium/appium/pull/12401>
* <https://github.com/appium/appium-xcuitest-driver/pull/911>
* <https://github.com/appium/appium-xcuitest-driver/pull/931>
* <https://github.com/appium/appium-xcuitest-driver/pull/939>
* <https://github.com/appium/WebDriverAgent/pull/163>
* <https://github.com/appium/appium-xcuitest-driver/pull/2194>
