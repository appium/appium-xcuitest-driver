---
hide:
  - toc

title: Appium Server Arguments
---

Some driver arguments can be set when launching the Appium server. This can be done as follows:

```
appium --driver-xcuitest-[argName]=[argValue]
```

|Argument|Description|Default|Example|
|----|-------|-----------|-------|
| `webdriveragent-port` | Local port used for communicating with WebDriverAgent | `8100` | `--driver-xcuitest-webdriveragent-port=8200` |
