## Touch ID

Appium has the capability to simulate [Touch ID](https://support.apple.com/en-ca/HT201371) on iOS Simulators.

### Support
* TouchID simulation is only supported in iOS Simulators. It is not possible to simulate touchId on real devices.
* Not all iOS devices have touchId so your tests should handle the case where touchId is not supported

### Configuration
* To use touchId, the application that Appium launches from (such as Terminal, AppiumDesktop, or iTerm) must be added to the accessibility preferences on your Mac. Navigate to `System Preferences > Security & Privacy > Accessibility` and under `Allow the apps below to control your computer` add the application. (The only way Appium can enable enrollment and toggling of Touch ID is to use system-level accessibility APIs to simulate mouse clicks on the Simulator menus via AppleScript. For this reason this feature requires that you give Appium's running context access to these accessibility APIs).

### Usage
* Set the desired capability `allowTouchIdEnroll` to true.
* When the Simulator starts, touch id enrollment will be enabled by default.
* You can toggle touchId enrollment by calling the client method associated with the endpoint /session/:sessionId/appium/simulator/toggle_touch_id_enrollment