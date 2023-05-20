---
title: Device Preparation
hide:
  - navigation
---

## Automatic device preference update

Appium XCUITest prepares preferences of the device under test automatically.
Some of them are also configurable via Appium capabilities and the Settings API.

### Keyboards configuration

Appium configures keyboard preferences by default to make test runs more stable.
You can change some of them via the Settings API.

- Turn `Auto-Correction` in Keyboards off
- Turn `Predictive` in Keyboards off
- Mark keyboard tutorial as complete
- (Only for Simulator) Toggle software keyboard on

## Manual setup for fine tuning

Automatic configuration availability is limited on iOS, especially for a real device. You may need to manually change the device configuration.

### Enable Web testing availability

Please turn on _Web Inspector_ on iOS device via _Settings_ -> _Safari_ -> _Advanced_

### Avoid possible wrong coordinate

Please make sure the zoom preference in accessibility is turned off via _Settings_ -> _Accessibility_ -> _Zoom_. It could cause element coordinates miscalculation.

### Expose more elements if needed

In some cases, enabling of the below preferences helps to make some view elements accessible. Appium does not modify these settings automatically, since they could affect the way your application under test performs. Please change them manually if needed.

- Turn `Spoken Content` in _Settings_ -> _Accessibility_ on
- Turn `Speak Selection` in _Settings_ -> _Accessibility_ on

Note that the available accessibility content depends on the OS version.
