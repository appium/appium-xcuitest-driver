---
hide:
  - toc

title: Touch ID
---

The XCUITest driver has the capability to simulate [Touch ID](https://support.apple.com/en-ca/HT201371).

!!! note

    This functionality is only supported on simulators.

## Configuration

To use Touch ID, the application that Appium launches from (Terminal, iTerm, etc.) must be added to
the accessibility preferences on your Mac. Navigate to _System Preferences -> Privacy & Security ->
Accessibility_ and under _Allow the apps below to control your computer_ add the application.

Why this is needed: The only way Appium can enable enrollment and toggling of Touch ID is to use
system-level accessibility APIs to simulate mouse clicks on the simulator menus via AppleScript.

## Usage

* Set the capability `appium:allowTouchIdEnroll` to `true`.
* When the Simulator starts, Touch ID enrollment will be enabled by default
* You can toggle Touch ID enrollment by calling the
  [`mobile: enrollBiometric`](../reference/execute-methods.md#mobile-enrollbiometric) extension

!!! note

    Remember that not all iOS devices have Touch ID, so your tests should handle cases where
    Touch ID is not supported.
