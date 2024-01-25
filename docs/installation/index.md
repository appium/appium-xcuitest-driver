---
hide:
  - toc

title: Installation
---

!!! info

    Before installing, make sure to check the [System Requirements](./requirements.md).

Use the Appium [extension CLI](https://appium.io/docs/en/latest/cli/extensions/) to
add this driver to your Appium install:

```bash
appium driver install xcuitest
```

Alternatively, if you are running a Node.js project, you can include `appium-xcuitest-driver` as
one of your dependencies.

To activate the driver, simply launch the Appium server. By default, Appium will load all the
installed drivers:

```bash
appium
```

You should see some output that includes a line like this:

```
[Appium] XCUITestDriver has been successfully loaded in 0.789s
```

Once you have installed the driver and confirmed it works, you should continue with
[device preparation](../preparation/index.md).
