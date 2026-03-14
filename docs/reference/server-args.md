---
hide:
  - toc

title: Appium Server Arguments
---

Some driver arguments can be set when launching the Appium server. This can be done as follows:

```
appium --driver-xcuitest-[argName]=[argValue]
```

For other command line flags recognized by the Appium server, see
[their Appium docs reference page](https://appium.io/docs/en/latest/reference/cli/server/).

|Argument|Description|Default|Example|
|----|-------|-----------|-------|
| `webdriveragent-port` | Local port used for communicating with WebDriverAgent | `8100` | `--driver-xcuitest-webdriveragent-port=8200` |
