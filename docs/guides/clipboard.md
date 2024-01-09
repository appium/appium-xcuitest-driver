---
title: Get/Set Clipboard
---

## Get Clipboard

For iOS 13+ real devices, Apple security preferences require the WebDriverAgentRunner application to be in foreground in order to be able to receive the system clipboard content.
Otherwise an empty string is always returned, or it could raise an exception like (this issue)[https://github.com/appium/appium/issues/18730].
Consider using [Activate App](../reference/execute-methods.md/#mobile-activateapp) and [Background App](../reference/execute-methods.md/#mobile-backgroundapp) to change the foreground application.

Simulators also have the same behavior, but [mobile: getPasteboard](../reference/execute-methods.md#mobile-getpasteboard) should help for simulators.


### Example

```ruby
# Ruby

# Bring the WebDriverAgent foreground. The bundle id depends on configuration such as "appium:updatedWDABundleId" for real devices.
driver.execute_script 'mobile: activateApp', {bundleId: 'com.facebook.WebDriverAgentRunner.xctrunner'}
# Get the clipboard content
driver.get_clipboard
# Go back to the application under test
driver.execute_script 'mobile: activateApp', {bundleId: '<bundle id of the test app>'}
```

## Set Clipboard

For iOS 15+ real devices, Apple security preferences require the WebDriverAgentRunner application to be in foreground in order to set the system clipboard content.
Consider using [Activate App](../reference/execute-methods.md/#mobile-activateapp) and [Background App](../reference/execute-methods.md/#mobile-backgroundapp) to change the foreground application. 

[mobile: setPasteboard](../reference/execute-methods.md#mobile-setpasteboard) also helps for simulators.

### Example

```ruby
# Ruby

# Bring the WebDriverAgent foreground. The bundle id depends on configuration such as "appium:updatedWDABundleId" for real devices.
driver.execute_script 'mobile: activateApp', {bundleId: 'com.facebook.WebDriverAgentRunner.xctrunner'}
# Set the clipboard content
driver.driver.set_clipboard(content: 'happy testing')
# Go back to the application under test
driver.execute_script 'mobile: activateApp', {bundleId: '<bundle id of the test app>'}
```
