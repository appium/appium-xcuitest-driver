---
hide:
  - navigation
  - toc

title: Overview
---

The XCUITest driver combines several different technologies to achieve its functionality:

- Native testing is based on Apple's [XCTest](https://developer.apple.com/documentation/xctest) framework
  and Appium's fork of Facebook's [WebDriverAgent](https://github.com/appium/WebDriverAgent) server
  (the [original](https://github.com/facebookarchive/WebDriverAgent) project is not supported anymore)
    - In native mode, the driver operates in scope of [WebDriver W3C protocol](https://w3c.github.io/webdriver)
      with several platform-specific extensions
- Webview communication is done via [Webkit remote debugger protocol](https://github.com/appium/appium-remote-debugger)
    - In webview mode, the driver can only operate in scope of the obsolete [JSONWP protocol](https://webdriver.io/docs/api/jsonwp.html)
- Real device communication is provided by the [`appium-ios-device`](https://github.com/appium/appium-ios-device) library
- Simulator communication is provided by the [`appium-ios-simulator`](https://github.com/appium/appium-ios-simulator) library
