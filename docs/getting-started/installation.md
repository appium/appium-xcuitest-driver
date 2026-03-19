---
hide:
  - toc

title: Installation
---

Provided you have set up [all the prerequisites](./system-requirements.md), or at the very least,
a compatible macOS version with Appium, you can install the driver using Appium's
[extension CLI](https://appium.io/docs/en/latest/cli/extensions/):

```bash
appium driver install xcuitest
```

You can also specify an exact driver version:

```bash
appium driver install xcuitest@7.16.0
```

Alternatively, if you are running a Node.js project, you can include `appium-xcuitest-driver` as
one of your project dependencies. [Refer to the Appium documentation](https://appium.io/docs/en/latest/guides/managing-exts/#do-it-yourself-with-npm)
for more information about this approach.

## Verify the Installation

In order to check that the driver was installed correctly, simply launch the Appium server:

```bash
appium
```

The server log output should include a line like the following:

```
[Appium] XCUITestDriver has been successfully loaded in 0.789s
```
