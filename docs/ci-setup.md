## CI Setup

Setting up XCUItest driver in an automated environment brings a few challenges with it.
Any scenario where user interaction is required must be automated or avoided all together.
For real device set up you should first follow the steps in [this guide](real-device-config.md).

### Keychains

One common such scenario is a prompt asking for a keychain to be unlocked in order to sign the WebDriverAgent.
There are multiple possible solutions for this:

1. Keychains can be set to have no timeout and be unlocked manually once. This can be done using the keychain access application. Sometimes keychains still lock themselves though and this approach is not recommended.
2. [It is possible to create a second keychain](../README.md#real-device-security-settings), which just stores the required certificate to sign the WebDriverAgent.
The issue with this approach is, that Codesign wants to unlock all listed keychains regardless of the specified keychain, thus leading to a password prompt.
This can be avoided by setting the default keychain and basically hiding the login keychain at the start of building.
[This](https://stackoverflow.com/questions/16550594/jenkins-xcode-build-works-codesign-fails) shows how to utelize this approach.
Impractical when running other build jobs simultaneously.
3. Stick with the existing keychains as in approach number one, but explicitly call unlock keychain before **each** build. This can be done using [fastlane unlock_keychain](https://docs.fastlane.tools/actions/unlock_keychain/) or by using [security unlock-keychain](https://stackoverflow.com/a/9678612/8182823) directly.
The password can be saved as a CI variable/secret, but this doesn't work for multiple machines with different keychain passwords. Setting the keychain password in each machine's .bashrc as an environment variable does the trick.

It is recommended to go with the second or third option.
The third one is the easiest and most reliable one to set up at the cost of having to set the keychain password as an environment variable.

### Xcode

When setting up a new machine as a CI server you are probably going to install Xcode, without executing it once, because you are not going to use it for development.
Make sure to start Xcode at least once and do the initial set up and install the suggested extensions for iPhone, watchOS and similar.

### Linking Apple Account

This only applies for real device set up.
Make sure to link your 'Apple Developer Account' in the machine's system wide "Account Panel" when using the "Basic (automatic) configuration" described [here](real-device-config.md#basic-automatic-configuration).

### Troubleshooting

Enable the `appium:showXcodeLog` [capability](../README.md#webdriveragent) and check the appium server output.
