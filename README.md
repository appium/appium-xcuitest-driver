# appium-xcuitest-driver

[![npm version](http://img.shields.io/npm/v/appium-xcuitest-driver.svg)](https://npmjs.org/package/appium-xcuitest-driver)
[![Downloads](http://img.shields.io/npm/dm/appium-xcuitest-driver.svg)](https://npmjs.org/package/appium-xcuitest-driver)

[![Release](https://github.com/appium/appium-xcuitest-driver/actions/workflows/publish.js.yml/badge.svg)](https://github.com/appium/appium-xcuitest-driver/actions/workflows/publish.js.yml)

This is an [Appium](https://appium.github.io/appium) driver for automating iOS applications on iOS,
iPadOS, and tvOS. You can add it to your Appium 2+ server install: (Only macOS is supported as the host platform, as it requires Xcode and developer tools.)

```bash
appium driver install xcuitest
```

## Documentation

The [Documentation](https://appium.github.io/appium-xcuitest-driver) is hosted separately at
[https://appium.github.io/appium-xcuitest-driver](https://appium.github.io/appium-xcuitest-driver)

## Contributing & Development

Clone this project from GitHub and run:

```bash
npm install
```

To watch changes during the development:

```bash
npm run watch
```

To run unit/functional tests:

```bash
npm test # unit 
npm run e2e-test # functional
```

There are also a number of environment variables that can be used when running
the tests locally. These include:

* `REAL_DEVICE` - set to anything truthy, makes the tests use real device capabilities
* `_FORCE_LOGS` - set to `1` to get the log output, not just spec
* `PLATFORM_VERSION` - change the version to run the tests against (defaults to `9.3`)
* `XCCONFIG_FILE` - specify where the xcode config file is for a real device run (if
  blank, and running a real device test, it will search for the first file in
  the root directory of the repo with the extension "xcconfig")
* `UICATALOG_REAL_DEVICE` - path to the real device build of UICatalog, in case
  the npm installed one is not built for real device
