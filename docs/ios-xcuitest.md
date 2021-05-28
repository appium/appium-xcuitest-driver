## The XCUITest Driver for iOS

### Server Arguments

Appium 2.0 Usage: `node . --driver-args='{"xcuitest": {[argNames]: [argValues]}}'`

<expand_table>

|Argument|Default|Description|Example|
|----|-------|-----------|-------|

|`"webkitDebugProxyPort"`|27753|Local port used for communication with ios-webkit-debug-proxy|`--driver-args='{"xcuitest": {"webkitDebugProxyPort": 27753}}'`|
|`"wdaLocalPort"`|8100| Local port used for communication with ios-web-driver-agent|`--driver-args='{"xcuitest": {"wdaLocalPort": 8100}}'`|