---
title: Appium Server Arguments
---

These arguments are set when you launch the Appium server, with this driver installed. They are for system administrators.

Usage: `appium --driver-args='{"xcuitest": {[argName]: [argValue]}}'`

<expand_table>

|Argument|Default|Description|Example|
|----|-------|-----------|-------|
| wdaLocalPort | 8100 | Local port used for communication with ios-web-driver-agent | `--driver-args='{"xcuitest": {"wdaLocalPort": 8100}}'` |

