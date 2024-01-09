---
hide:
  - toc

title: Appium Server Arguments
---

Some driver arguments can be set when launching the Appium server. This can be done as follows:

```
appium --driver='{"xcuitest": {[argName]: [argValue]}}'
```

<expand_table>

|Argument|Description|Default|Example|
|----|-------|-----------|-------|
| `wdaLocalPort` | Local port used for communicating with WebDriverAgent | `8100` | `--driver='{"xcuitest": {"wdaLocalPort": 8100}}'` |
