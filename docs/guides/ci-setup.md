---
title: Continuous Integration
---

Setting up the XCUITest driver in an automated environment brings a few challenges with it. Any scenario
where user interaction is required must be automated or avoided altogether. For real device setup,
you should first follow the [Real Device Configuration tutorial](../preparation/real-device-config.md).

### Keychains

One common scenario is a prompt asking for a keychain to be unlocked in order to sign the WebDriverAgent.
There are multiple possible solutions for this:

1. Keychains can be set to have no timeout and be unlocked manually once. This can be done using the
   keychain access application. Sometimes keychains still lock themselves though and this approach
   is not recommended.
2. [It is possible to create a second keychain](../guides/troubleshooting.md#real-device-security-settings),
   which just stores the required certificate to sign the WebDriverAgent. The issue with this
   approach is that Codesign wants to unlock all listed keychains regardless of the specified
   keychain, thus leading to a password prompt. This can be avoided by setting the default keychain
   and basically hiding the login keychain at the start of the build.
   [See this Stackoverflow article](https://stackoverflow.com/questions/16550594/jenkins-xcode-build-works-codesign-fails)
   for how to utilize this approach. It is impractical when running other build jobs simultaneously.
3. Stick with the existing keychains as in approach 1, but explicitly call unlock keychain before
   **each** build. This can be done using [fastlane unlock_keychain](https://docs.fastlane.tools/actions/unlock_keychain/)
   or by using [security unlock-keychain](https://www.unix.com/man-page/osx/1/security/) directly.
   The password can be saved as a CI variable/secret or on the machine itself.

It is recommended to go with the second or third option. The third one is the easiest and most
reliable one to set up, at the cost of having to set the keychain password as an environment variable.

### Xcode

When setting up a new machine as a CI server, you are probably going to install Xcode, without
executing it once, because you are not going to use it for development. Make sure to start Xcode at
least once and do the initial set up and install the suggested extensions.

### Linking Apple Account

This only applies for real device set up. Make sure to link your 'Apple Developer Account' in the
machine's system wide "Account Panel" when using the "Basic Automatic Configuration" described
[here](../preparation/prov-profile-basic-auto.md).

### Troubleshooting

Enable the `appium:showXcodeLog` [capability](../reference/capabilities.md#webdriveragent) and
check the Appium server output.
