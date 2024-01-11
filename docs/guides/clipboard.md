---
hide:
  - toc

title: Get/Set Clipboard
---

Working with the clipboard on real devices has an Apple security limitation, where the
WebDriverAgentRunner application must be in foreground in order for the action to work. Otherwise
an empty string is always returned, or it could raise an exception like
[this issue](https://github.com/appium/appium/issues/18730).

Consider using [`mobile: activateApp`](../reference/execute-methods.md/#mobile-activateapp)
and [`mobile: backgroundApp`](../reference/execute-methods.md/#mobile-backgroundapp) to change the
foreground application.

## Get Clipboard

Applies to iOS 13+ real devices. You can also use
[`mobile: getPasteboard`](../reference/execute-methods.md#mobile-getpasteboard) for simulators.

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

Applies to iOS 15+ real devices. You can also use
[`mobile: setPasteboard`](../reference/execute-methods.md#mobile-setpasteboard) for simulators.

```ruby
# Ruby

# Bring the WebDriverAgent foreground. The bundle id depends on configuration such as "appium:updatedWDABundleId" for real devices.
driver.execute_script 'mobile: activateApp', {bundleId: 'com.facebook.WebDriverAgentRunner.xctrunner'}
# Set the clipboard content
driver.set_clipboard(content: 'happy testing')
# Go back to the application under test
driver.execute_script 'mobile: activateApp', {bundleId: '<bundle id of the test app>'}
```
