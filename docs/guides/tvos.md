---
title: tvOS Automation
---

The XCUITest driver supports automation of the tvOS platform. The driver is compatible not only
with simulators, but also with real wired and wireless devices.

All tvOS sessions must set their `platformName` capability to `tvOS` (instead of `iOS`).

## Simulator Setup

Apart from installing the simulator itself, no additional configuration is needed - you can start a
session right away. Make sure to provide the simulator's `deviceName` and `platformVersion`:

```json
{
    "platformName": "tvOS",
    "appium:automationName": "XCUITest",
    "appium:deviceName": "<apple-tv-simulator-name>",
    "appium:platformVersion": "<tvos-version>",
    ...
}
```

## Real Device Setup

Similarly to real iOS/iPadOS devices, real tvOS devices also have several additional prerequisites.
For wireless devices, configuration is highly dependent on your tvOS version.

### Wireless tvOS 18 or Later

Devices running tvOS 18 or later use Remote XPC services for pairing and communication. This
functionality is provided by the optional [`appium-ios-remotexpc`](https://github.com/appium/appium-ios-remotexpc/)
library. You can also skip this Remote XPC approach and use the solutions described in the tvOS 17
section, though they are limited and less reliable compared to Remote XPC.

1. Ensure you are using XCUITest driver `>= 10.30.0`, and have installed `appium-ios-remotexpc >= 0.13.0`

2. Set up the common configuration described in the [Real Device Setup](../getting-started/device-setup.md#real-devices)
   document, including the provisioning profile

3. Pair your Apple TV device to the driver, similarly to how it was paired to Xcode in step 2:

    1. Enable discovery mode in _Settings_ -> _Remotes and Devices_ -> _Remote App and Device_
    2. Run the dedicated driver script for pairing (`sudo` required):

        ```bash
        sudo appium driver run xcuitest pair-appletv
        ```

        The above command will return a prompt for selecting a specific device. You can also skip
        interactive selection by using the `--device` option. See [the Scripts reference page](../reference/scripts.md#pair-appletv)
        for more information.

    3. When prompted, enter the PIN that appears on the Apple TV
        
    If successful, the script will print an identifier for the paired Apple TV device. This
    identifier _may_ be different from the device's standard UDID - in such cases it should replace
    the standard UDID in all future actions.

    For additional details on this procedure (discovery, cryptography, credential storage,
    troubleshooting), refer to [the full pairing guide](https://github.com/appium/appium-ios-remotexpc/blob/main/docs/apple-tv-pairing-guide.md)
    in the `appium-ios-remotexpc` project.

4. Start a Remote XPC tunnel for your Apple TV, using another driver script (`sudo` required):

    ```bash
    sudo appium driver run xcuitest tunnel-creation -- --appletv-device-id <udid-from-pairing-script>
    ```

    It is also recommended to set the `--disconnect-retry-max-attempts` flag to `3` or more, as
    disconnects are likely to occur. Refer to the [Remote XPC guide](./remotexpc-tunnels-real-devices.md)
    and [Scripts reference page](../reference/scripts.md#tunnel-creation) for more details.

5. Launch the Appium server (in a separate process from the Remote XPC tunnel), then start a
   session as normal, making sure to use the UDID from step 3:

    ```json
    {
        "platformName": "tvOS",
        "appium:automationName": "XCUITest",
        "appium:udid": "<udid-from-pairing-script>",
        "appium:platformVersion": "<tvos-version>",
        ...
    }
    ```

### Wireless tvOS 17 or Later

For devices running tvOS 17, the approach slightly differs depending on your Xcode version. It also
works for devices running tvOS 18 or later, but is discouraged in favor of [the aforementioned Remote XPC approach](#wireless-tvos-18-or-later).

1. Ensure you are using XCUITest driver `>= 10.10.0`

2. Set up the common configuration described in the [Real Device Setup](../getting-started/device-setup.md#real-devices)
   document, including the provisioning profile

3. Launch the Appium server with the `APPIUM_XCUITEST_PREFER_DEVICECTL` flag:

    ```sh
    APPIUM_XCUITEST_PREFER_DEVICECTL=1 appium
    ```

4. If running Xcode `>= 26.1`:

    1. Start a session with the additional `appium:wdaBaseUrl` capability, which must be set to the
       IP address of the Apple TV:

        ```json
        {
            "platformName": "tvOS",
            "appium:automationName": "XCUITest",
            "appium:udid": "<apple-tv-udid>",
            "appium:platformVersion": "<tvos-version>",
            "appium:wdaBaseUrl": "http://<apple-tv-ip-address>",
            ...
        }
        ```

        You can omit this capability if using [the Preinstalled WDA approach](./run-preinstalled-wda.md).

5. If running Xcode `<= 26.0.1`:

    1. Manually build and launch WebDriverAgentRunner (WDA) yourself. This can be done through the
       Xcode GUI or otherwise. You can also refer to the steps in the [Run Preinstalled WDA](./run-preinstalled-wda.md#install-webdriveragent)
       guide.
    
    2. Follow the [Attach to Running WDA](./attach-to-running-wda.md) guide and start a session
       with the `appium:webDriverAgentUrl` capability.

### Wireless tvOS 16 or Earlier

Such devices have not been officially tested, but [user reports](https://github.com/appium/appium/issues/19343)
have shown that they are discoverable and automatable with the same real device requirements as
iOS/iPadOS. You can therefore follow the [Real Device Setup](../getting-started/device-setup.md#real-devices)
document, then start a session as normal:

```json
{
    "platformName": "tvOS",
    "appium:automationName": "XCUITest",
    "appium:udid": "<apple-tv-udid>",
    "appium:platformVersion": "<tvos-version>",
    ...
}
```

### Wired

Wired tvOS devices (Apple TV HD) use the same approach as iOS/iPadOS devices. Simply follow the
[Real Device Setup](../getting-started/device-setup.md#real-devices) document, then start a session
as normal:

```json
{
    "platformName": "tvOS",
    "appium:automationName": "XCUITest",
    "appium:udid": "<apple-tv-udid>",
    "appium:platformVersion": "<tvos-version",
    ...
}
```

## Session Actions

Unlike iOS/iPadOS, interactions with tvOS use [remote controller](https://developer.apple.com/design/human-interface-guidelines/tvos/remote-and-controllers/remote/)
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
