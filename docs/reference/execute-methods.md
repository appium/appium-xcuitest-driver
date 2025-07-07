---
title: Execute Methods
---

In addition to standard W3C APIs, the driver provides many custom command extensions for executing
platform-specific scenarios. Use the following examples in order to invoke them from your client code:

=== "Java"

    ```java
    var result = driver.executeScript("mobile: <methodName>", Map.ofEntries(
        Map.entry("arg1", "value1"),
        Map.entry("arg2", "value2")
        // you may add more pairs if needed or skip providing the map completely
        // if all arguments are defined as optional
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    const result = await driver.executeScript('mobile: <methodName>', [{
        arg1: "value1",
        arg2: "value2",
    }]);
    ```

=== "Python"

    ```python
    result = driver.execute_script('mobile: <methodName>', {
        'arg1': 'value1',
        'arg2': 'value2',
    })
    ```

=== "Ruby"

    ```ruby
    result = @driver.execute_script 'mobile: <methodName>', {
        arg1: 'value1',
        arg2: 'value2',
    }
    ```

=== "C#"

    ```csharp
    object result = driver.ExecuteScript("mobile: <methodName>", new Dictionary<string, object>() {
        {"arg1", "value1"},
        {"arg2", "value2"}
    }));
    ```

### mobile: selectPickerWheelValue

Performs selection of the next or previous picker wheel value. This might
be useful if these values are populated dynamically, so you don't know which
one to select or value selection suing `sendKeys` API does not work because of an XCTest bug. The method throws an exception if it fails to change the current picker value.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId (`element` before version 1.22) | string | yes | PickerWheel's internal element id (as hexadecimal hash string) to perform value selection on. The element must be of type XCUIElementTypePickerWheel | abcdef12-1111-2222-3333-444444
order | string | yes | Either `next` to select the value next to the current one from the target picker wheel or `previous` to select the previous one. | next
offset | number | no | The value in range [0.01, 0.5]. It defines how far from picker wheel's center the click should happen. The actual distance is calculated by multiplying this value to the actual picker wheel height. Too small offset value may not change the picker wheel value and too high value may cause the wheel to switch two or more values at once. Usually the optimal value is located in range [0.15, 0.3]. `0.2` by default | 0.15
value | string | no | If provided WDA will try to automatically scroll in the given direction until the actual picker value reaches the expected one or the amount of scrolling attempts is exceeded. | myvalue
maxAttempts | number | no | The maximum number of scrolling attempts to reach `value` before an error will be thrown. Only makes sense in combination with `value`. 25 by default | 50

### mobile: sendMemoryWarning

Simulates sending of Low Memory warning to the target application.
It might be useful to verify the
[didReceiveMemoryWarning](https://developer.apple.com/documentation/uikit/uiviewcontroller/1621409-didreceivememorywarning?language=objc)
API in the application under test.
This feature only works on real devices running iOS 17+ with Xcode 15+ SDK.
The target application must be running while this API is called.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | Bundle identifier of the app to simulate the warning for | com.great.app

### mobile: alert

Tries to apply the given action to the currently visible alert.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
action | string | yes | The actual action to apply. Could be either: `accept`, `dismiss` or `getButtons` | accept
buttonLabel | string | no | The name of the button used to perform the chosen alert action. Only makes sense if the action is `accept` or `dismiss` | Accept

#### Returned Result

The list of alert button names if the selected action is `getButtons`

### mobile: setPasteboard

Sets the Simulator's pasteboard content to the given value. Does not work for real devices.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
content | string | yes | The content to set | hello
encoding | string | no | The content's encoding. `utf8` by default | ascii

### mobile: getPasteboard

Gets the Simulator's pasteboard content. Does not work for real devices.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
encoding | string | no | The expected encoding of the returned string. `utf8` by default | ascii

#### Returned Result

The pasteboard content string.

### mobile: source

Allows to retrieve the source tree of the current page in different representation formats.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
format | string | yes | One of possible page tree source representation formats: `xml` (the default value), `description` and `json`. The `xml` format generates the output similar to what `getPageSource` standard API returns. `description` representation is how XCTest "sees" the page internally and is the same string as [debugDescription](https://developer.apple.com/documentation/xctest/xcuielement/1500909-debugdescription?language=objc) API would return for the root application element. This source representation format is useful for debugging purposes and is the fastest one to fetch. `json` representation is similar to `xml`, but the tree hierarchy there is represented as JSON elements tree rather than as XML nodes. | description
excludedAttributes | string | no | One or more comma-separated attribute names to be excluded from the XML output, thus only makes sense if `format` is set to `xml`. It might be sometimes helpful to exclude, for example, the `visible` attribute, to significantly speed-up page source retrieval. | visible,accessible

#### Returned Result

The page source tree formatted according to the given format argument.

### mobile: getContexts

Retrieves the list of available contexts including the extended context information, like urls and page names. This is different from the standard `getContexts` API, because the latter only has web view names without any additional information. In situation where multiple web views are available at once the client code would have to connect to each of them in order to detect the one, which needs to be interacted with. Although, this extra effort is not needed with the information provided by this extension.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
waitForWebviewMs | number | no | Tells Appium for how long (in milliseconds) to wait for web view(s) to appear. `5000`ms by default | 10000

#### Returned Result

The list of available context objects along with their properties:

- id: The identifier of the context. The native context will be 'NATIVE_APP' and the webviews will be 'WEBVIEW_xxx'
- title: The title associated with the webview content. Could be `null`
- url: The url associated with the webview content. Could be `null`

### mobile: installApp

Installs the given application to the device under test. Make sure the application is built for a correct architecture and is signed with a proper developer signature (for real devices) prior to install it.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
app | string | yes | See the description of the `appium:app` capability | /path/to/my.app
timeoutMs | number | no | The maximum time to wait until app install is finished in milliseconds on real devices. If not provided then the value of `appium:appPushTimeout` capability is used. If the capability is not provided then equals to 240000ms | 500000
**Deprecated** **Not Used since v7.15.0** strategy | string | no | One of possible app installation strategies on real devices. This argument is ignored on simulators. If not provided then the value of `appium:appInstallStrategy` is used. If the latter is also not provided then `serial` is used. See the description of `appium:appInstallStrategy` capability for more details on available values. | parallel
checkVersion | bool | no | If set to `true`, it will make xcuitest driver to verify whether the app version currently installed on the device under test is older than the one, which is provided as `app` value. No app install is going to happen if the candidate app has the same or older version number than the already installed copy of it. The version number used for comparison must be provided as [CFBundleVersion](https://developer.apple.com/documentation/bundleresources/information_property_list/cfbundleversion) [Semantic Versioning](https://semver.org/)-compatible value in the application's `Info.plist`. No validation is performed and the `app` is installed if `checkVersion` was not provided or `false`, which is default behavior. | true

### mobile: isAppInstalled

Checks whether the given application is installed on the device under test.
[Offloaded applications](https://discussions.apple.com/thread/254887240) are handled as not installed.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be checked | com.mycompany.myapp

#### Returned Result

Either `true` or `false`

### mobile: removeApp

Removes the given application from the device under test.
[Offloaded application](https://discussions.apple.com/thread/254887240) can also be removed.

For real devices, please also check [how to explicitly clear the application local data](../guides/troubleshooting.md#leftover-application-data-on-real-devices).

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be removed | com.mycompany.myapp

#### Returned Result

Either `true` if the application was successfully uninstalled, otherwise `false`

### mobile: launchApp

Executes the given application on the device under test. If the application is already running then it would be activated.
If the application is not installed or cannot be launched then an exception is thrown.

It accepts `arguments` and `environment` to start an application with them.

As an usage example, `arguments` allow you to enforce language and locale for the application to start with.
XCTest lets you to start an application process by specifying [Language and Locale IDs](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPInternational/LanguageandLocaleIDs/LanguageandLocaleIDs.html) via process `arguments` with `-AppleLanguages` and `-AppleLocale`.
Check the [Testing Specific Languages and Regions part of the Testing Your Internationalized App](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPInternational/TestingYourInternationalApp/TestingYourInternationalApp.html) for more details.
Make sure to terminate the application before launching it with `arguments` if it is already running.

=== "Java"

    ```java
    driver.executeScript("mobile:launchApp", Map.of(
        "bundleId", "com.apple.Preferences",
        "arguments", Arrays.asList("-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP")
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    await driver.executeScript('mobile:launchApp', [{
      bundleId: 'com.apple.Preferences',
      arguments: ['-AppleLanguages', '(ja)', '-AppleLocale', 'ja_JP']
    }]);
    ```

=== "Python"

    ```python
    driver.execute_script("mobile:launchApp", {
      "bundleId": "com.apple.Preferences",
      "arguments": ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
    })
    ```

=== "Ruby"

    ```ruby
    driver.execute_script "mobile:launchApp", {
      "bundleId": "com.apple.Preferences",
      "arguments": ["-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP"]
    }
    ```

=== "C#"

    ```csharp
    driver.ExecuteScript("mobile:launchApp", new Dictionary<string, object>() {
        {"bundleId", "com.apple.Preferences"},
        {"arguments", new List<string>() { "-AppleLanguages", "(ja)", "-AppleLocale", "ja_JP" }}
    });
    ```

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be launched | com.mycompany.myapp
arguments | string&#124;array | no | One or more command line arguments for the app. If the app is already running then this argument is ignored. | ['-s', '-m']
environment | dict | no | Environment variables mapping for the app. If the app is already running then this argument is ignored. | {'var': 'value'}

### mobile: terminateApp

Terminates the given app on the device under test via [XCTest's terminate](https://developer.apple.com/documentation/xctest/xcuiapplication/1500637-terminate) API. If the app is not installed an exception is thrown. If the app is not running then nothing is done.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be terminated | com.mycompany.myapp

#### Returned Result

Either `true` if the app was successfully terminated, otherwise `false`

### mobile: killApp

Kill the given app on the real device under test by instruments service.
If the app is not running or failed to kill, then nothing is done.

XCUITest driver 4.4 and higher does not require [py-ios-device](https://github.com/YueChen-C/py-ios-device).
XCUITest driver 4.3 requires [py-ios-device](https://github.com/YueChen-C/py-ios-device).

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be terminated | com.mycompany.myapp

#### Returned Result

Either `true` if the app was successfully killed, otherwise `false`

### mobile: queryAppState

Queries the state of an installed application from the device under test. An exception will be thrown if the app with given identifier is not installed.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be queried | com.mycompany.myapp

#### Returned Result

An integer number is returned, which encodes the application state. Possible values are described in [XCUIApplicationState](https://developer.apple.com/documentation/xctest/xcuiapplicationstate?language=objc) XCTest documentation topic.

### mobile: activateApp

Puts the given application to foreground if it is running in the background. An error is thrown if the app is not installed or is not running. Nothing is done if the app is already running in the foreground.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be activated | com.mycompany.myapp

### mobile: listApps

List applications installed on the real device under test. This extension throws an error if called
for a Simulator device.
Offload applications will not be in the result.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
applicationType | string | no | The type of applications to list. Either `System` or `User` (the default one) | System

#### Returned Result

A list of apps, where each item is a map where keys are bundle identifiers and values are maps of platform-specific app properties. Having `UIFileSharingEnabled` set to `true` in the app properties map means this app supports files upload and download into its `documents` container. Read the [File Transfer](../guides/file-transfer.md) guide for more details.

### mobile: clearApp

Deletes data files from the data container of an installed app,
so it could start from the clean state next time it is launched.
The destination app will be terminated if it is running when this API is invoked.
Sometimes it might also be necessary to invoke the following APIs
to fully reset the state of an installed app (make sure the app is not running while
calling them):
- [mobile: clearKeychains](#mobile-clearkeychains)
- [mobile: resetPermission](#mobile-resetpermission)

This API might not be 100% reliable for some apps. The only reliable method to fully
reset an existing app that Apple supports is to [uninstall](#mobile-removeapp) it and then perform a fresh [install](#mobile-installapp) of the same app.

This API only works on simulators. An exception is thrown if executed with real devices.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the application to be cleared | com.mycompany.myapp

#### Returned Result

`true` if at least one item has been successfully deleted from the app data container.

### mobile: startPerfRecord

Starts performance profiling for the device under test.
Relaxing security is mandatory for simulators. It can always work for real devices.
Since XCode 12 the method tries to use `xctrace` tool to record performance stats.
The `instruments` developer utility is used as a fallback for this purpose if `xctrace` is not available. It is possible to record multiple profiles at the same time. Read [Instruments User Guide](https://developer.apple.com/library/content/documentation/DeveloperTools/Conceptual/InstrumentsUserGuide/Recording,Pausing,andStoppingTraces.html) for more details.
If the recording for the given profile is already running then nothing is done.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
timeout | number | no | The maximum count of milliseconds to record the profiling information. It is recommended to always limit the maximum duration of perf record operation, since the resulting logs are pretty huge and may easily exceed the free space on th local storage volume. `300000`ms by default (5 minutes) | `600000`
profileName | string | no | The name of existing performance profile to apply. Can also contain the full path to the chosen template on the server file system. Note, that not all profiles are supported on mobile devices. `Activity Monitor` by default. | `Time Profile`
pid | string or number | no | The ID of the process to measure the performance for. Set it to `current` in order to measure the performance of the process, which belongs to the currently active application. All processes running on the device are measured if pid is unset (the default setting). | current

### mobile: stopPerfRecord

Stops the performance recording operation previously started by `mobile: startPerfRecord` call. If the previous call has already been completed due to the timeout then its result is returned immediately. An error is thrown if the performance recording has failed to start and recorded no data.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
profileName | string | no | The name of existing performance profile to stop the recording for. Multiple recorders for different profile names could be executed at the same time. `Activity Monitor` by default. | `Time Profile`
remotePath | string | no | The path to the remote location, where the resulting zipped .trace file should be uploaded. The following protocols are supported: http/https, ftp Null or empty string value (the default setting) means the content of resulting file should be zipped, encoded as Base64 and passed as the endpoint response value. An exception will be thrown if the generated file is too big to fit into the available process memory. | https://myserver/upload
user | string | no | The name of the user for the remote authentication. Only works if `remotePath` is provided. | myuser
pass | string | no | The password for the remote authentication. Only works if `remotePath` is provided. | mypassword
method | string | no | The http multipart upload method name. Only works if `remotePath` is provided. `PUT` by default | POST
headers | dict | no | Additional headers mapping for multipart http(s) uploads | {'User-Agent': 'Myserver 1.0'}
fileFieldName | string | no | The name of the form field, where the file content BLOB should be stored for http(s) uploads. `file` by default | payload
formFields | dict or array | no | Additional form fields for multipart http(s) uploads | {'field2': 'value2'}

#### Returned Result

The resulting file in .trace format can be either returned directly as base64-encoded zip archive or uploaded to a remote location (such files could be pretty large), depending on the `remotePath` argument value. Afterwards it is possible to unarchive and open such file with Xcode Developer Tools.

### mobile: installCertificate

Installs a custom certificate onto the device. Since Xcode SDK 11.4 Apple has added a dedicated simctl subcommand to quickly handle certificates on Simulator over CLI.
On real devices the certificate could be installed via CLI if [py-ios-device](https://github.com/YueChen-C/py-ios-device) tool is available on the server machine.
On simulators before Xcode 11.4 SDK Apple provides no official way to do it via the command line. In such case (and also as a fallback if CLI setup fails) this method tries to wrap the certificate into .mobileconfig format and then deploys the wrapped file to the internal HTTP server, so one can open it via mobile Safari. Then the algorithm goes through the profile installation procedure by clicking the necessary buttons using WebDriverAgent.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
content | string | yes | Base64-encoded content of the public certificate in [PEM](https://knowledge.digicert.com/quovadis/ssl-certificates/ssl-general-topics/what-is-pem-format.html) format | a23234...
commonName | string | no | Common name of the certificate. If this is not set then the script will try to parse it from the given certificate content. | com.myorg
isRoot | boolean | no | This option defines where the certificate should be installed to: either Trusted Root Store (`true`, the default option) or the Keychain (`false`). On environments other than Xcode 11.4+ Simulator this option is ignored. | false

#### Returned Result

The content of the generated .mobileconfig file as base64-encoded string. This config might be useful for debugging purposes. If the certificate has been successfully set via CLI then nothing is returned.

### mobile: removeCertificate

Removes installed certificate for real devices only if [py-ios-device](https://github.com/YueChen-C/py-ios-device) tool is available on the server machine since driver version 4.19.2.

#### Arguments

Name | Type | Required | Description | Example
---  | --- | --- | --- | ---
name | string | yes | Name of the profile  | com.orgname.profile.mdmprofile

#### Returned Result

Returns status acknowledgment `{'Status': 'Acknowledged'}` if successfully removed certificate or `None` if unable to remove certificate.

### mobile: listCertificates

Lists installed certificates for real devices only if [py-ios-device](https://github.com/YueChen-C/py-ios-device) tool is available on the server machine since driver version 4.10.0.

#### Returned Result

Returns map of certificates installed on the real device. The response looks like:

```json
{
    'OrderedIdentifiers': ['com.orgname.profile.mdmprofile'],
    'ProfileManifest': {
        'com.orgname.profile.mdmprofile': {
            'Description': 'MDM Profile',
            'IsActive': True
        }
    },
    'ProfileMetadata': {
        'com.orgname.profile.mdmprofile': {
            'PayloadDescription': 'MDM Profile for testing,
            'PayloadDisplayName': 'MDM Profile',
            'PayloadOrganization': 'My Org, Inc.',
            'PayloadRemovalDisallowed': False,
            'PayloadUUID': '9ab3fa27-cc45-4c23-a94a-714686397a86',
            'PayloadVersion': 1
        }
    },
    'Status': 'Acknowledged'
}
```

### mobile: startLogsBroadcast

Starts iOS system logs broadcast websocket on the same host and port where Appium server is running at `/ws/session/:sessionId:/appium/syslog` endpoint. The method will return immediately if the web socket is already listening.
Each connected webcoket listener will receive syslog lines as soon as they are visible to Appium.
Read [Using Mobile Execution Commands to Continuously Stream Device Logs with Appium](https://appiumpro.com/editions/55-using-mobile-execution-commands-to-continuously-stream-device-logs-with-appium) Appium Pro article for more details on this feature.

Consider using [logs broadcast via BiDi](./bidi.md#logentryadded) over this extension.

### mobile: stopLogsBroadcast

Stops the syslog broadcasting wesocket server previously started by `mobile: startLogsBroadcast`. This method will return immediately if no server is running.

Consider using [logs broadcast via BiDi](./bidi.md#logentryadded) over this extension.

### mobile: batteryInfo

Reads the battery information from the device under test. This endpoint only returns reliable result on real devices.

#### Returned Result

The returned object always includes at least the following entries:

- `level`: Battery level in range [0.0, 1.0], where 1.0 means 100% charge.
- `state`: Battery state as an integer number. The following values are possible:
   *   UIDeviceBatteryStateUnknown = 0
   *   UIDeviceBatteryStateUnplugged = 1  // on battery, discharging
   *   UIDeviceBatteryStateCharging = 2   // plugged in, less than 100%
   *   UIDeviceBatteryStateFull = 3       // plugged in, at 100%

On iOS 18 and newer real devices, the returned object may also include many additional advanced battery information fields, such as capacity, health metrics, temperature, and more. For a full list of possible advanced fields, see the [BatteryInfo](../../lib/commands/advanced-battery-types.ts).

The returned object is a superset of the basic battery info, and may look like:

```json
{
  "level": 0.85,
  "state": 2,
  "advance": {
    "AbsoluteCapacity": 1234,
    "CycleCount": 456,
    "Temperature": 29.5,
    "...": "other advanced fields"
  }
}
```

If advanced fields are not available (e.g., on older iOS versions or simulators), only `level` and `state` will be present.

### mobile: deviceInfo

Returns the miscellaneous information about the device under test.
It includes device information via lockdown in a real device since XCUITest driver 4.2.0.

#### Returned Result

The returned device information map contains the following entries:

Name | Type | Description | Example
--- | --- | --- | ---
currentLocale | string | Device locale name. See [autoupdatingCurrentLocale](https://developer.apple.com/documentation/foundation/nslocale/1414388-autoupdatingcurrentlocale) for more details. | ja_EN, zh-Hant_US
timeZone | string | Device time zone name. See [NSTimeZone](https://developer.apple.com/documentation/foundation/nstimezone?language=objc) documentation for more details. | America/New_York
name | string | Device name, synonym for model. Prior to iOS 16, user-assigned device name. See [UIDevice.name](https://developer.apple.com/documentation/uikit/uidevice/1620015-name?language=objc) documentation for more details. | iPhone
model | string | The model of the device. See [UIDevice.model](https://developer.apple.com/documentation/uikit/uidevice/1620044-model?language=objc) documentation for more details. | iPod touch
uuid | string | Device [identifier for vendor](https://developer.apple.com/documentation/uikit/uidevice/1620059-identifierforvendor?language=objc). Could be equal to `unknown` if cannot be retrieved. | 12345abcd
userInterfaceIdiom | number | The style of the interface on the current device. Could help to determine the device type (e.g. iPhone vs iPad). See [UIDevice.userInterfaceIdiom](https://developer.apple.com/documentation/uikit/uidevice/1620037-userinterfaceidiom?language=objc) for more details. | 0 (UIUserInterfaceIdiomUnspecified), 1 (UIUserInterfaceIdiomPhone), 2 (UIUserInterfaceIdiomPad), 3 (UIUserInterfaceIdiomTV)
userInterfaceStyle | string | The device's UI [appearance](https://developer.apple.com/documentation/xctest/xcuidevice/4108227-appearance?language=objc) style. Possible values are: `automatic`, `light`, `dark`, `unknown`. | dark
isSimulator | number | Whether the device is a simulator (1) or a real device (0) | 1
thermalState | number | Thermal state of the device. See [NSProcessInfoThermalState](https://developer.apple.com/documentation/foundation/nsprocessinfothermalstate) documentation on possible values. | 0 (NSProcessInfoThermalStateNominal), 1 (NSProcessInfoThermalStateFair), 2 (NSProcessInfoThermalStateSerious), 3 (NSProcessInfoThermalStateCritical)

### mobile: getDeviceTime

Returns the actual device time.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
format | string | no | The format specifier string. Read [MomentJS documentation](https://momentjs.com/docs/) to get the full list of supported datetime format specifiers. The default format is `YYYY-MM-DDTHH:mm:ssZ`, which complies to ISO-8601 | `YYYY-MM-DD HH:mm:ss`

#### Returned Result

The retrieved datetime string formatted according to the given format specfier.

### mobile: activeAppInfo

Returns information about the active application.

#### Returned Result

The API returns a map with the following entries

Name | Type | Description | Example
--- | --- | --- | ---
pid | number | The process identifier of the active application | 1234
bundleId | string | The bundle identifier of the active application | com.yolo.myapp
name | string | The name of the active application, if present | Safari
processArguments | map | The map containing actual process arguments. Check the description of the [appium:processArguments capability](./capabilities.md#webdriveragent) for more details on its format. Might be empty if no process arguments have been provided on the app startup. | {"args": ["--help"], "env": {"PATH": "/"}}

### mobile: pressButton

Emulates press action on the given physical device button. iOS is [pressButton:](https://developer.apple.com/documentation/xctest/xcuidevice/1619052-pressbutton), tvOS is [pressButton:](https://developer.apple.com/documentation/xctest/xcuiremote/1627475-pressbutton) or [pressButton:forDuration:](https://developer.apple.com/documentation/xctest/xcuiremote/1627476-pressbutton).
[mobile: performIoHidEvent](#mobile-performiohidevent) calls a more universal API to perform press with duration on any supported device.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
name | string | yes | The name of the button to be pressed. Supported button names for iOS-based devices are (case-insensitive): `home`, `volumeup`, `volumedown`. For tvOS-based devices (case-insensitive): `home`, `up`, `down`, `left`, `right`, `menu`, `playpause`, `select` | home
durationSeconds | number | no | Duration in float seconds for tvOS-based devices since Appium 1.22.0 | 10

### mobile: pushNotification

Simulates push notification delivery to Simulator.
Only application remote push notifications are supported. VoIP, Complication, File Provider,
and other types are not supported. Check the output of `xcrun simctl help push`
command for more details.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the target application | com.apple.Preferences
payload | map | yes | Valid Apple Push Notification values. Read the `Create the JSON Payload` topic of the [official Apple documentation](https://developer.apple.com/documentation/usernotifications/setting_up_a_remote_notification_server/generating_a_remote_notification?language=objc) for more details on the payload creation. | `{"aps": {"alert": {"title": "This is a simulated notification!"}, "badge": 3, "sound": "default"} }`

### mobile: expectNotification

Blocks until the expected notification is delivered.
It is a thin wrapper over [XCTNSNotificationExpectation](https://developer.apple.com/documentation/xctest/xctnsnotificationexpectation?language=objc) and
[XCTDarwinNotificationExpectation](https://developer.apple.com/documentation/xctest/xctdarwinnotificationexpectation?language=objc) entities.
The extension call throws [TimeoutError](https://www.selenium.dev/selenium/docs/api/javascript/module/selenium-webdriver/lib/error_exports_TimeoutError.html) if the expected notification has not been delivered within the given timeout.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
name | string | yes | The name of the notification to expect | com.example.fooAllDone
type | string | no | Which notification type to expect. Either `plain` (the default value) to wait for a notification from the *default* notification center or `darwin` to wait for a system notification. | darwin
timeoutSeconds | number | no | For how long to wait until the notification is delivered in float seconds. 60 seconds by default | 5.5

### mobile: performIoHidEvent

Emulates triggering of the given low-level IO HID device event. Constants for possible events are defined
in [HID Usage Tables](https://developer.apple.com/documentation/hiddriverkit/hid_usage_tables).
For example, in order to emulate single press on Home button the extension should be called with the following arguments:
- page: `0x0C` (`kHIDPage_Consumer`, select the `Customer` page)
- usage: `0x40` (`kHIDUsage_Csmr_Menu`, the `Csmr` prefix here means this usage is dedicated to the `Customer` page)
- durationSeconds: `0.005` (The event duration should be 5 milliseconds to be recognized as a single press by iOS)

Some popular constants:

Name | Value | Description
--- | --- | ---
kHIDPage_Consumer | 0x0C | The page containing all usages prefixed with `kHIDUsage_Csmr_`
kHIDUsage_Csmr_VolumeIncrement | 0xE9 | Volume Up
kHIDUsage_Csmr_VolumeDecrement | 0xEA | Volume Down
kHIDUsage_Csmr_Menu | 0x40 | Home
kHIDUsage_Csmr_Power | 0x30 | Power/Lock
kHIDUsage_Csmr_Snapshot | 0x65 | Power + Home

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
page | int | yes | The event page identifier. Look for constants perfixed with `kHIDPage_` in the table above | 0x0C
usage | int | yes | The event usage identifier (usages are defined per-page). Look for constants prefixed with `kHIDUsage_` in the table above | 0x40
durationSeconds | number | yes | The event duration in float seconds. XCTest uses `0.005` for a single press event duration | 2.5

### mobile: enrollBiometric

Enrolls biometric authentication on Simulator.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
isEnabled | boolean | no | Whether to enable/disable biometric enrollment. `true` by default. | true

### mobile: sendBiometricMatch

Emulates biometric match/non-match event on Simulator. The biometric feature is expected to be already enrolled before executing that.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
type | string | no | The biometric feature name. Either `touchId` or `faceId`. `touchId` by default. | faceId
match | boolean | no | Whether to simulate biometric match (`true`, the default value) or non-match (`false`). | true

### mobile: isBiometricEnrolled

Checks whether biometric is currently enrolled or not on a Simulator device.

#### Returned Result

Either `true` or `false`

### mobile: clearKeychains

Clears keychains on Simulator. An exception is thrown for real devices.

### mobile: getPermission

Gets application permission state on Simulator. This method requires [WIX applesimutils](https://github.com/wix/AppleSimulatorUtils) to be installed on the host where Appium server is running.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the destination app. | com.mycompany.myapp
service | string | yes | One of available service names. The following services are supported: `calendar`, `camera`, `contacts`, `homekit`, `microphone`, `photos`, `reminders`, `medialibrary`, `motion`, `health`, `siri`, `speech`. | true

#### Returned Result

Either 'yes', 'no', 'unset' or 'limited'

### mobile: setPermission

Set application permission state on Simulator.

`location` and `location-always` services are by `xcrun simctl privacy` command since XCUITest driver version 5.11.0.
The command will kill the `bundleId` application process if it is running.

Other services such as `contacts` are processed by [WIX applesimutils](https://github.com/wix/AppleSimulatorUtils), which will not kill the `bundleId` application process.
[WIX applesimutils](https://github.com/wix/AppleSimulatorUtils) needs to be installed on the host where Appium server is running.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundleId | string | yes | The bundle identifier of the destination app. | com.mycompany.myapp
access | map | yes | One or more access rules to set. The following keys are supported: `all` (Apply the action to all services), `calendar` (Allow access to calendar), `contacts-limited` (Allow access to basic contact info), `contacts` (Allow access to full contact details), `location` (Allow access to location services when app is in use), `location-always` (Allow access to location services at all times), `photos-add` (Allow adding photos to the photo library), `photos` (Allow full access to the photo library), `media-library` (Allow access to the media library), `microphone` (Allow access to audio input), `motion` (Allow access to motion and fitness data), `reminders` (Allow access to reminders), `siri` (Allow use of the app with Siri.). The following values are supported: `yes` (To grant the permission), `no` (To revoke the permission), `unset` (To reset the permission) | {'all': 'yes'}

### mobile: resetPermission

Resets the given permission for the active application under test. Works for both Simulator and real devices using Xcode SDK 11.4+

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
service | string or int | yes | One of available service names. The supported service names are: `calendar`, `camera`, `contacts`, `health`, `homekit`, `keyboardnet`, `location`, `medialibrary`, `microphone`, `photos`, `reminders`, `systemroot`, `userdesktop`, `userdocuments`, `userdownloads`, `bluetooth`. This could also be an integer protected resource identifier taken from [XCUIProtectedResource](https://developer.apple.com/documentation/xctest/xcuiprotectedresource?language=objc) | photos

### mobile: getAppearance

Get the device's UI appearance style.

#### Returned Result

An object, with the following entries:
- style: The device's UI appearance value. This could be one of: `light`, `dark`, `unknown`, `unsupported`

### mobile: setAppearance

Set the device's UI appearance style.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
style | string | yes | Either `light` or `dark` | dark

### mobile: getIncreaseContrast

Get the device's "increase contrast" accessibility mode.
This API only works on simulators. An exception is thrown if executed with real devices.

#### Returned Result

One of below:

- `enabled`: Increase Contrast is enabled.
- `disabled`: Increase Contrast is disabled.
- `unsupported`: The platform or runtime version does not support the Increase Contrast setting.
- `unknown`: The current setting is unknown or there was an error detecting it.


### mobile: setIncreaseContrast

Enable or disable the device's "increase contrast" accessibility mode.
This API only works on simulators. An exception is thrown if executed with real devices.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
increaseContrast | string | yes | Either `enabled` or `disabled` (case insensitive) | 'enabled'

### mobile: contentSize

Get the device's content size.
This API only works on simulators. An exception is thrown if executed with real devices.

#### Returned Result

One of below:

- `extra-small`
- `small`
- `medium`
- `large`
- `extra-large`
- `extra-extra-large`
- `extra-extra-extra-large`
- `accessibility-medium`
- `accessibility-large`
- `accessibility-extra-large`
- `accessibility-extra-extra-large`
- `accessibility-extra-extra-extra-large`
- `unknown`
- `unsupported`

### mobile: setContentSize

Set the device's content size.
This API only works on simulators. An exception is thrown if executed with real devices.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
size | string | yes | One of the content sizes listed below in case-insensitive. | large

- `extra-small`
- `small`
- `medium`
- `large`
- `extra-large`
- `extra-extra-large`
- `extra-extra-extra-large`
- `accessibility-medium`
- `accessibility-large`
- `accessibility-extra-large`
- `accessibility-extra-extra-large`
- `accessibility-extra-extra-extra-large`

### mobile: getClipboard

Gets the content of the primary clipboard on the device under test.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
contentType | string | no | `plaintext` (default), `image` or `url` | image

#### Returned Result

The actual clipboard content encoded into base64 string.
An empty string is returned if the clipboard contains no data.

### mobile: setClipboard

Sets the primary clipboard's content on the device under test.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
content| string | yes | The content to be set as base64-encoded string. | QXBwaXVt
contentType | string | no | `plaintext` (default), `image` or `url` | image

### mobile: siriCommand

Presents the Siri UI, if it is not currently active, and accepts a string which is then processed as if it were recognized speech. Check the documentation on [activateWithVoiceRecognitionText](https://developer.apple.com/documentation/xctest/xcuisiriservice/2852140-activatewithvoicerecognitiontext?language=objc) XCTest method for more details.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
text | string | yes | The actual command that will be passed to Siri service | Hello Siri

### mobile: pullFile

Pulls a remote file from the device.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | yes | The path to an existing remote file on the device. See the [File Transfer](../guides/file-transfer.md) guide for accepted formats. If the file with the given name does not exist an exception will be thrown. | @com.mycompany.myapp:documents/myfile.txt

#### Returned Result

Base64-encoded string, which represents the content of the remote file.

### mobile: pushFile

Pushes a local file to the device.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | yes | The path on the device to where the payload should be written. The value format is similar to the one used in [pullFile](#mobile-pullfile) extension. If the file with the same name already exists then it will be silently overridden. | @com.mycompany.myapp:documents/myfile.txt
payload | string | yes | Base64-encoded content of the file to be pushed. | QXBwaXVt

### mobile: pullFolder

Pulls a remote folder from the device.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | yes | Same as for [pullFile](#mobile-pullfile) extension, but should be pointing to a remote folder | @com.mycompany.myapp:documents/myfolder/

#### Returned Result

Base64-encoded string, which represents the zipped content of the remote folder.

### mobile: deleteFile

Deletes the given file from the device under test.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | yes | Same as for [pullFile](#mobile-pullfile) extension | @com.mycompany.myapp:documents/myfile.txt

### mobile: deleteFolder

Deletes the given folder from the device under test.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | yes | Same value as for `mobile: deleteFile` except of the fact it should be pointing to a folder and should end with a single slash `/` | @com.mycompany.myapp:documents/myfolder/

### mobile: configureLocalization

Change localization settings on the currently booted Simulator.
The changed settings are only applied for the *newly started* applications/activities.
Currently running applications will stay unchanged. This means, for example, that the keyboard
should be hidden and shown again in order to observe the changed layout, and corresponding
apps must be restarted in order to observe their interface using the newly set locale/language.
Also this method might leave some system UI alerts untranslated.
Be careful while setting the actual arguments since their actual values are not strictly checked.
This could lead to an unexpected behavior if an incorrect/unsupported language or locale abbreviation is provided.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
keyboard | map | no | On-screen keyboard properties. The `name` key is required and should be set to a valid locale abbreviation. The `layout` key is also required. The `hardware` key is optional and could be omitted or set to `Automated`. You could switch the keyboard layout in system preferences of your booted simulator, run `xcrun simctl spawn booted defaults read .GlobalPreferences.plist`, and inspect the value of `AppleKeyboards` to see possible combinations. | `{"name": "de_CH", "layout": "QWERTZ", "hardware": "Automated"}`
language | map | no | System language properties. The `name` key is required and should be set to a valid language abbreviation. You could switch the system language in preferences of your booted simulator, run `xcrun simctl spawn booted defaults read .GlobalPreferences.plist`, and inspect the value of `AppleLanguages` to see possible combinations. | `{"name": "zh-Hant-CN"}`
locale | map | no | System locale properties. The `name` key is required and should be set to a valid language abbreviation. The `calendar`key is optional and could be set to a valid calendar format name. You could switch the system locale/calendar format in preferences of your booted simulator, run `xcrun simctl spawn booted defaults read .GlobalPreferences.plist`, and inspect the value of `AppleLocale` to see possible combinations. | `{"name": "uk_UA", "calendar": "gregorian"}`

#### Returned Result

`true` if any of settings has been successfully changed.

### mobile: startAudioRecording

Records the given hardware audio input into an .mp4 file. You must allow the `audio_record` security feature in order to use this extension. Also it is required that [FFMpeg](https://ffmpeg.org/) is installed on the machibe where Appium server is running.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
audioInput | string or int | yes | The name of the corresponding audio input device to use for the capture. The full list of capture devices could be shown using `ffmpeg -f avfoundation -list_devices true -i ""` Terminal command. | 1
audioCodec | string | no | The name of the audio codec. The Advanced Audio Codec (aac) is used by default. | aac
audioBitrate | string | no | The bitrate of the resulting audio stream. `128k` by default. | 256k
audioChannels | string or int | no | The count of audio channels in the resulting stream. Setting it to `1` will create a single channel (mono) audio stream. `2` By default | 1
audioRate | string or int | no | The sampling rate of the resulting audio stream. 44100 by default | 22050
timeLimit | string or int | no | The maximum recording time, in seconds. The default value is `180`, the maximum value is `43200` (12 hours). | 60
forceRestart | boolean | no | Whether to restart audio capture process forcefully when startRecordingAudio is called (`true`) or ignore the call until the current audio recording is completed (`false`, the default value). | true

### mobile: stopAudioRecording

Stops recording of the audio input. If no audio recording process is running then the endpoint will try to get the recently recorded file. If no previously recorded file is found and no active audio recording processes are running then the method returns an empty string.

#### Returned Result

Base64-encoded content of the recorded media file or an empty string if no audio recording has been started before.

### mobile: startPcap

Start mobile device network traffic capture. This extension only works if [py-ios-device](https://github.com/YueChen-C/py-ios-device) utility is installed on the server machine and only supports
real iOS devices.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
timeLimitSec | string or int | no | The maximum recording time, in seconds. The default value is `180`, the maximum value is `43200` (12 hours). | 60
forceRestart | boolean | no | Whether to restart traffic capture process forcefully when startPcap is called (`true`) or ignore the call until the current traffic capture is completed (`false`, the default value). | true

### mobile: stopPcap

Stops network traffic capture. If no traffic capture process is running then the endpoint will try to get the recently recorded file. If no previously recorded file is found and no active traffic capture processes are running then the method returns an empty string.

#### Returned Result

Base64-encoded content of the traffic capture file (.pcap) or an empty string if no traffic capture has been started before. Network capture files could be opened in [Wireshark](https://www.wireshark.org/) application.

### mobile: runXCTest

Run a native XCTest script. Launches a subprocess that runs the XC Test and blocks until it is completed. Parses the stdout of the process and returns its result as an array. Facebook's [IDB](https://github.com/facebook/idb) tool is required to run such tests.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
testRunnerBundleId | string | yes | Test app bundle | io.appium.XCTesterAppUITests.xctrunner
appUnderTestBundleId | string | yes | App-under-test bundle | com.mycompany.myapp
xcTestBundleID | string | yes | xctest bundle id | io.appium.XCTesterAppUITests
testType | string | no | Test type. Either `ui` (the default one), `app` or `logic` | app
env | map | no | Environment variables mapping to be passed to the test | {'myvar': 'myvalue'}
args | array | no | Launch arguments to start the test with (see https://developer.apple.com/documentation/xctest/xcuiapplication/1500477-launcharguments for reference) | ['-arg1', '--arg2']
timeout | string or int | no | Timeout if session doesn't complete after given time (in milliseconds). `360000`ms by default | 120000

#### Returned Result

The API calls returns a map with the following entries:

- results: The array of test results. Each item in this array conists of the following entries:
   * testName: Name of the test (e.g.: 'XCTesterAppUITests - XCTesterAppUITests.XCTesterAppUITests/testExample')
   * passed: Did the tests pass?
   * crashed: Did the tests crash?
   * status: Test result status (e.g.: 'passed', 'failed', 'crashed')
   * duration: How long did the tests take (in seconds)
   * failureMessage: Failure message (if applicable)
   * location The geolocation of the test (if applicable)
- code: The exit code of the process. `0` value marks a successful execution.
- signal: The signal that terminated the process. Could be `null` (e.g.: `SIGTERM`)

### mobile: installXCTestBundle

Installs an XCTest bundle to the device under test. Facebook's [IDB](https://github.com/facebook/idb) tool is required to for this API to work.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
xctestBundle | string | yes | Path to your xctest .app bundle. Could be an URL | /path/to/my/bundle.app

### mobile: listXCTestBundles

List XCTest bundles that are installed on device. Facebook's [IDB](https://github.com/facebook/idb) tool is required to for this API to work.

#### Returned Result

Array of XCTest bundles (e.g.: ["XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance"])

### mobile: listXCTestsInTestBundle

List XCTests in a test bundle. Facebook's [IDB](https://github.com/facebook/idb) tool is required to for this API to work.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
bundle | string | yes | Bundle ID of the XCTest | 'com.bundle.myapp'

#### Returned Result

Array of xctests in the test bundle (e.g.: `[ 'XCTesterAppUITests.XCTesterAppUITests/testExample', 'XCTesterAppUITests.XCTesterAppUITests/testLaunchPerformance' ]`)

### mobile: viewportRect

Retrieves the viewport dimensions.
The viewport is the device's screen size with status bar size subtracted if the latter is present/visible.

#### Returned Result

The response looks like `{"value":{"left":0,"top":96,"width":828,"height":1696}}`.

`left` and `top` are distance from the `left` of the screen and the `top` of the screen. [iOS Drawing Concepts](https://developer.apple.com/library/archive/documentation/2DDrawing/Conceptual/DrawingPrintingiOS/GraphicsDrawingOverview/GraphicsDrawingOverview.html) could help about the relationship of coordinate.

`width` and `height` are the screen's width and height.

### mobile: viewportScreenshot

Takes a screenshot of the device viewport (see [`mobile: viewportRect`](#mobile-viewportrect))

!!! warning "Unreliable"

    This method is unreliable. We recommend using `getScreenshot` instead

#### Returned Result

Base64-encoded string, which represents the viewport screenshot.

### mobile: deviceScreenInfo

Get information about screen.

#### Returned Result

The response looks like `{"value":{"statusBarSize":{"width":414,"height":48},"scale":2}}`

`statusBarSize` contains status bar dimensions. It is the result of [status bar](https://developer.apple.com/documentation/xctest/xcuielementtypequeryprovider/1500428-statusbars).
`scale` is [screen scale](https://developer.apple.com/documentation/uikit/uiscreen/1617836-scale).

### mobile: swipe

This gesture performs a simple "swipe" gesture on the particular screen element or
on the application element, which is usually the whole screen. This method does not
accept coordinates and simply emulates single swipe with one finger. It might be
useful for such cases like album pagination, switching views, etc. More advanced
cases may require to call [mobile: dragFromToForDuration](#mobile-dragfromtoforduration),
where one can supply coordinates and duration.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId ("element" prior to Appium v 1.22) | string | no | The internal element identifier (as hexadecimal hash string) to swipe on. Application element will be used instead if this argument is not provided | fe50b60b-916d-420b-8728-ee2072ec53eb
direction | Either 'up', 'down', 'left' or 'right' | yes | The direction in which to swipe | up
velocity | number | no | This argument is optional and is only supported since Appium server version 1.19 and Xcode SDK version 11.4+. The value is measured in pixels per second and same values could behave differently on different devices depending on their display density. Higher values make swipe gesture faster (which usually scrolls larger areas if we apply it to a list) and lower values slow it down. Only values greater than zero have effect. | 250

#### Examples

=== "Java"

    ```java
    RemoteWebElement e = driver.findElement(AppiumBy.accessibilityId("target element"));
    driver.executeScript("mobile: swipe", ImmutableMap.of(
        "velocity": 2500,
        "direction": "down",
        "elementId", e.getId()
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    const e = await $('~target element');
    await driver.executeScript("mobile: swipe", [{
      velocity: 2500,
      direction: "down",
      elementId: e.elementId
    }]);

=== "Python"

    ```python
    e = driver.find_element(by=AppiumBy.ACCESSIBILITY_ID, value='target element')
    driver.execute_script("mobile: swipe", {
      "velocity": 2500,
      "direction": "down",
      "elementId": e.id
    })
    ```

=== "Ruby"

    ```ruby
    e = driver.find_element :accessibility_id, 'target element'
    driver.execute_script 'mobile: swipe', {
      velocity: 2500,
      direction: 'down',
      elementId: e.ref
    }
    ```

=== "C#"

    ```csharp
    var e = driver.FindElement(By.AccessibilityId("target element"))
    driver.ExecuteScript("mobile: swipe", new Dictionary<string, object>() {
        {"elementId", element.Id},
        {"direction", "down" },
        {"velocity", 2500 }
    });
    ```

#### References

- [swipeDown](https://developer.apple.com/documentation/xctest/xcuielement/1618664-swipedown?language=objc)
- [swipeDownWithVelocity:](https://developer.apple.com/documentation/xctest/xcuielement/3551694-swipedownwithvelocity?language=objc)
- [swipeUp](https://developer.apple.com/documentation/xctest/xcuielement/1618667-swipeup?language=objc)
- [swipeUpWithVelocity:](https://developer.apple.com/documentation/xctest/xcuielement/3551697-swipeupwithvelocity?language=objc)
- [swipeLeft](https://developer.apple.com/documentation/xctest/xcuielement/1618668-swipeleft?language=objc)
- [swipeLeftWithVelocity:](https://developer.apple.com/documentation/xctest/xcuielement/3551695-swipeleftwithvelocity?language=objc)
- [swipeRight](https://developer.apple.com/documentation/xctest/xcuielement/1618674-swiperight?language=objc)
- [swipeRightWithVelocity:](https://developer.apple.com/documentation/xctest/xcuielement/3551696-swiperightwithvelocity?language=objc)

### mobile: scroll

Scrolls the element or the whole screen. Different scrolling strategies are supported.
Arguments define the chosen strategy: either 'name', 'direction', 'predicateString' or
'toVisible' in that order. All strategies are exclusive and only one strategy
can be applied at a single moment of time. Use "mobile: scroll" to emulate precise
scrolling in tables or collection views, where it is already known to which element
the scrolling should be performed. Although, there is one known limitation there: in case
it is necessary to perform too many scroll gestures on parent container to reach the
necessary child element (tens of them) then the method call may fail.
_Important_: The implementation of this extension relies on several undocumented XCTest features, which might not always be reliable. Thus it might *not* always work as expected.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId ("element" prior to Appium v 1.22) | string | no | The internal element identifier (as hexadecimal hash string) to scroll on (e.g. the container). The active application element will be used instead if this parameter is not provided. | fe50b60b-916d-420b-8728-ee2072ec53eb
name | string | no | The accessibility id of the child element, to which scrolling is performed. The same result can be achieved by setting _predicateString_ argument to 'name == accessibilityId'. Has no effect if _elementId_ is not a container | cell12
direction | Either 'up', 'down', 'left' or 'right' | yes | The main difference from [swipe](#mobile-swipe) call with the same argument is that _scroll_ will try to move the current viewport exactly to the next/previous page (the term "page" means the content, which fits into a single device screen) | down
predicateString | string | no | The NSPredicate locator of the child element, to which the scrolling should be performed. Has no effect if _elementId_ is not a container | label == "foo"
toVisible | boolean | no | If set to _true_ then asks to scroll to the first visible _elementId_ in the parent container. Has no effect if _elementId_ is not set | true

#### Examples

=== "Java"

    ```java
    driver.executeScript("mobile: scroll", ImmutableMap.of(
        "direction", "down"
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    await driver.executeScript('mobile: scroll', [{
      direction: 'down'
    }]);

=== "Python"

    ```python
    driver.execute_script("mobile: scroll", {
      "direction": "down"
    })
    ```

=== "Ruby"

    ```ruby
    driver.execute_script 'mobile: scroll', {
      direction: 'down'
    }
    ```

=== "C#"

    ```csharp
    driver.ExecuteScript("mobile: scroll", new Dictionary<string, object>() {
        {"direction", "down"}
    });
    ```

### mobile: pinch

Performs pinch gesture on the given element or on the application element.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId ("element" prior to Appium v 1.22) | string | no | The internal element identifier (as hexadecimal hash string) to pinch on. The active application element will be used instead if this parameter is not provided. | fe50b60b-916d-420b-8728-ee2072ec53eb
scale | number | yes | Pinch scale of type float. Use a scale between 0 and 1 to "pinch close" or zoom out and a scale greater than 1 to "pinch open" or zoom in. | 0.5
velocity | number | yes | The velocity of the pinch in scale factor per second (float value) | 2.2

#### Examples

=== "Java"

    ```java
    RemoteWebElement e = driver.findElement(AppiumBy.accessibilityId("target element"));
    driver.executeScript("mobile: pinch", ImmutableMap.of(
        "scale", 0.5,
        "velocity", 1.1,
        "elementId", e.getId()
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    const e = await $('~target element');
    await driver.executeScript('mobile: pinch', [{
      scale: 0.5,
      velocity: 1.1,
      elementId: e.elementId
    }]);

=== "Python"

    ```python
    e = driver.find_element(by=AppiumBy.ACCESSIBILITY_ID, value='target element')
    driver.execute_script("mobile: pinch", {
      "scale": 0.5,
      "velocity": 1.1,
      "elementId": e.id
    })
    ```

=== "Ruby"

    ```ruby
    e = driver.find_element :accessibility_id, 'target element'
    driver.execute_script 'mobile: pinch', {
      scale: 0.5,
      velocity: 1.1,
      elementId: e.ref
    }
    ```

=== "C#"

    ```csharp
    var e = driver.FindElement(By.AccessibilityId("target element"))
    driver.ExecuteScript("mobile: pinch", new Dictionary<string, object>() {
        {"elementId", element.Id},
        {"scale", 0.5 },
        {"velocity", 1.1 },
    });
    ```

#### Reference

[pinchWithScale:velocity:](https://developer.apple.com/documentation/xctest/xcuielement/1618669-pinchwithscale?language=objc)

### mobile: doubleTap

Performs double tap gesture on the given element or on the screen.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId ("element" prior to Appium v 1.22) | string | no | The internal element identifier (as hexadecimal hash string) to double tap on. The active application element will be used instead if this parameter is not provided. | fe50b60b-916d-420b-8728-ee2072ec53eb
x | number | no | Horizontal coordinate offset. | 100
y | number | no | Vertical coordinate offset. | 100

#### Examples

=== "Java"

    ```java
    RemoteWebElement e = driver.findElement(AppiumBy.accessibilityId("target element"));
    driver.executeScript("mobile: doubleTap", ImmutableMap.of(
        "elementId", e.getId()
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    const e = await $('~target element');
    await driver.executeScript('mobile: doubleTap', [{
      elementId: e.elementId
    }]);

=== "Python"

    ```python
    e = driver.find_element(by=AppiumBy.ACCESSIBILITY_ID, value='target element')
    driver.execute_script("mobile: doubleTap", {
      "elementId": e.id
    })
    ```

=== "Ruby"

    ```ruby
    e = driver.find_element :accessibility_id, 'target element'
    driver.execute_script 'mobile: doubleTap', {
      elementId: e.ref
    }
    ```

=== "C#"

    ```csharp
    var e = driver.FindElement(By.AccessibilityId("target element"))
    driver.ExecuteScript("mobile: doubleTap", new Dictionary<string, object>() {
        {"elementId", element.Id}
    });
    ```

### mobile: touchAndHold

Performs long press gesture on the given element or on the screen.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId ("element" prior to Appium v 1.22) | string | no | The internal element identifier (as hexadecimal hash string) to long tap on. The active application element will be used instead if this parameter is not provided. | fe50b60b-916d-420b-8728-ee2072ec53eb
duration | number | yes | The float duration of press action in seconds | 1.5
x | number | no | Horizontal coordinate offset. | 100
y | number | no | Vertical coordinate offset. | 100

#### Examples

=== "Java"

    ```java
    RemoteWebElement e = driver.findElement(AppiumBy.accessibilityId("target element"));
    driver.executeScript("mobile: touchAndHold", ImmutableMap.of(
        "elementId", e.getId(),
        "duration", 2.0
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    const e = await $('~target element');
    await driver.executeScript('mobile: touchAndHold', [{
      elementId: e.elementId,
      duration: 2.0
    }]);

=== "Python"

    ```python
    e = driver.find_element(by=AppiumBy.ACCESSIBILITY_ID, value='target element')
    driver.execute_script("mobile: touchAndHold", {
      "elementId": e.id,
      "duration": 2.0
    })
    ```

=== "Ruby"

    ```ruby
    e = driver.find_element :accessibility_id, 'target element'
    driver.execute_script 'mobile: touchAndHold', {
      elementId: e.ref,
      duration: 2.0
    }
    ```

=== "C#"

    ```csharp
    var e = driver.FindElement(By.AccessibilityId("target element"))
    driver.ExecuteScript("mobile: touchAndHold", new Dictionary<string, object>() {
        {"elementId", element.Id},
        {"duration", 2.0}
    });
    ```

#### Reference

[pressForDuration:](https://developer.apple.com/documentation/xctest/xcuielement/1618663-pressforduration?language=objc)

### mobile: twoFingerTap

Performs two finger tap gesture on the given element or on the application element.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId ("element" prior to Appium v 1.22) | string | no | The internal element identifier (as hexadecimal hash string) to tap on. The active application element will be used instead if this parameter is not provided. | fe50b60b-916d-420b-8728-ee2072ec53eb

#### Examples

=== "Java"

    ```java
    RemoteWebElement e = driver.findElement(AppiumBy.accessibilityId("target element"));
    driver.executeScript("mobile: twoFingerTap", ImmutableMap.of(
        "elementId", e.getId()
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    const e = await $('~target element');
    await driver.executeScript('mobile: twoFingerTap', [{
      elementId: e.elementId
    }]);

=== "Python"

    ```python
    e = driver.find_element(by=AppiumBy.ACCESSIBILITY_ID, value='target element')
    driver.execute_script("mobile: twoFingerTap", {
      "elementId": e.id
    })
    ```

=== "Ruby"

    ```ruby
    e = driver.find_element :accessibility_id, 'target element'
    driver.execute_script 'mobile: twoFingerTap', {
      elementId: e.ref
    }
    ```

=== "C#"

    ```csharp
    var e = driver.FindElement(By.AccessibilityId("target element"))
    driver.ExecuteScript("mobile: twoFingerTap", new Dictionary<string, object>() {
        {"elementId", element.Id}
    });
    ```

#### Reference

[twoFingerTap](https://developer.apple.com/documentation/xctest/xcuielement/1618675-twofingertap?language=objc)

### mobile: tap

Performs tap gesture by coordinates on the given element or on the screen.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId ("element" prior to Appium v 1.22) | string | no | The internal element identifier (as hexadecimal hash string) to tap on. _x_ and _y_ tap coordinates will be calculated relatively to the current element position on the screen if this argument is provided. Otherwise they should be calculated relatively to the active application element. | fe50b60b-916d-420b-8728-ee2072ec53eb
x | number | yes | Horizontal coordinate offset. | 100
y | number | yes | Vertical coordinate offset. | 100

### mobile: dragFromToForDuration

Performs drag and drop gesture by coordinates. This can be done either on an element or
on the screen

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId ("element" prior to Appium v 1.22) | string | no | The internal element identifier (as hexadecimal hash string) to perform drag on. All the coordinates will be calculated relatively this this element position on the screen. Absolute screen coordinates are expected if this argument is not set | fe50b60b-916d-420b-8728-ee2072ec53eb
duration | number | yes | Float number of seconds in range [0.5, 60]. How long the tap gesture at starting drag point should be before to start dragging | 5.3
fromX | number | yes | The x coordinate of starting drag point | 100
fromY | number | yes | The y coordinate of starting drag point | 100
toX | number | yes | The x coordinate of ending drag point | 200
toY | number | yes | The y coordinate of ending drag point | 200

#### Examples

=== "Java"

    ```java
    RemoteWebElement e = driver.findElement(AppiumBy.accessibilityId("target element"));
    driver.executeScript("mobile: dragFromToForDuration", ImmutableMap.of(
        "elementId", e.getId(),
        "duration", 1.0,
        "fromX", 100,
        "fromY", 100,
        "toX", 200,
        "toY", 200
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    const e = await $('~target element');
    await driver.executeScript('mobile: dragFromToForDuration', [{
      elementId: e.elementId,
      duration: 1.0,
      fromX: 100,
      fromY: 100,
      toX: 200,
      toY: 200
    }]);

=== "Python"

    ```python
    e = driver.find_element(by=AppiumBy.ACCESSIBILITY_ID, value='target element')
    driver.execute_script("mobile: dragFromToForDuration", {
      "elementId": e.id,
      "duration": 1.0,
      "fromX": 100,
      "fromY": 100,
      "toX": 200,
      "toY": 200
    })
    ```

=== "Ruby"

    ```ruby
    e = driver.find_element :accessibility_id, 'target element'
    driver.execute_script 'mobile: dragFromToForDuration', {
      elementId: e.ref,
      duration: 1.0,
      fromX: 100,
      fromY: 100,
      toX: 200,
      toY: 200
    }
    ```

=== "C#"

    ```csharp
    var e = driver.FindElement(By.AccessibilityId("target element"))
    driver.ExecuteScript("mobile: dragFromToForDuration", new Dictionary<string, object>() {
        {"elementId", element.Id},
        {"duration", 1.0,}
        {"fromX", 100},
        {"fromY", 100},
        {"toX", 200},
        {"toY", 200}
    });
    ```


#### Reference

[clickForDuration:thenDragToElement:](https://developer.apple.com/documentation/xctest/xcuielement/1500989-clickforduration?language=objc)

### mobile: dragFromToWithVelocity

Initiates a press-and-hold gesture, drags to another coordinate or an element with a velocity you specify, and holds for a duration you specify.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
fromElementId | string | no | The internal element identifier (as hexadecimal hash string) to start the drag gesture from. Absolute screen coordinates are expected if this argument is not set | fe50b60b-916d-420b-8728-ee2072ec53eb
toElementId | string | no | The internal element identifier (as hexadecimal hash string) to end the drag gesture on. This parameter is mandatory if `fromElementId` is provided | fe50b60b-916d-420b-8728-ee2072ec53eb
pressDuration | number | yes | Float number of seconds in range [0, 60]. How long the tap gesture at starting drag point should be before to start dragging | 0.5
holdDuration | number | yes | Float number of seconds in range [0, 60]. The duration for which to hold over the other coordinate or the given element after dragging | 0.1
velocity | number | yes | The speed at which to move from the initial press position to the other element or coordinate, expressed in pixels per second | 400
fromX | number | no | The x coordinate of starting drag point. Must be provided if `fromElementId` is not defined | 100
fromY | number | no | The y coordinate of starting drag point. Must be provided if `fromElementId` is not defined | 100
toX | number | no | The x coordinate of ending drag point. Must be provided if `fromElementId` is not defined | 200
toY | number | no | The y coordinate of ending drag point. Must be provided if `fromElementId` is not defined | 200

#### References

[pressForDuration:thenDragToElement:withVelocity:thenHoldForDuration:](https://developer.apple.com/documentation/xctest/xcuielement/3551693-pressforduration?language=objc)
[pressForDuration:thenDragToCoordinate:withVelocity:thenHoldForDuration:](https://developer.apple.com/documentation/xctest/xcuicoordinate/3551692-pressforduration?language=objc)

### mobile: rotateElement

Performs [rotate](https://developer.apple.com/documentation/xctest/xcuielement/1618665-rotate?language=objc) gesture on the given element.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId ("element" prior to Appium v 1.22) | string | no | Internal element id (as hexadecimal hash string) to perform rotation on. The active application element will be used instead if this parameter is not provided. | fe50b60b-916d-420b-8728-ee2072ec53eb
rotation | number | yes | The rotation of the gesture in radians | Math.PI
velocity | number | yes | The velocity of the rotation gesture in radians per second | Math.PI / 4

#### Examples


=== "Java"

    ```java
    RemoteWebElement e = driver.findElement(AppiumBy.accessibilityId("target element"));
    driver.executeScript("mobile: rotateElement", ImmutableMap.of(
        // rotate clockwise, 90 degrees
        "rotation", -Math.PI / 2,
        // in approximately two seconds
        "velocity", Math.PI / 4,
        "elementId", e.getId()
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    const e = await $('~target element');
    await driver.executeScript('mobile: rotateElement', [{
      rotation: -Math.PI / 2,
      velocity: Math.PI / 4,
      elementId: e.elementId
    }]);
    ```

=== "Python"

    ```python
    e = driver.find_element(by=AppiumBy.ACCESSIBILITY_ID, value='target element')
    driver.execute_script("mobile: rotateElement", {
      "rotation": -math.pi / 2,
      "velocity": math.pi / 4,
      "elementId": e.id
    })
    ```

=== "Ruby"

    ```ruby
    e = driver.find_element :accessibility_id, 'target element'
    driver.execute_script 'mobile: rotateElement', {
      elementId: e.ref,
      rotation: PI / 2,
      velocity: PI / 4
    }
    ```

=== "C#"

    ```csharp
    var e = driver.FindElement(By.AccessibilityId("target element"))
    driver.ExecuteScript("mobile: rotateElement", new Dictionary<string, object>() {
        {"elementId", element.Id},
        {"rotation", -Math.PI / 2 },
        {"velocity", Math.PI / 4 },
    });
    ```


#### Reference

[rotate:withVelocity:](https://developer.apple.com/documentation/xctest/xcuielement/1618665-rotate?language=objc)

### mobile: tapWithNumberOfTaps

Sends one or more taps with one or more touch points since Appium 1.17.1.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId ("element" prior to Appium v 1.22) | string | no | The internal element identifier (as hexadecimal hash string) to perform one or more taps. The active application element will be used instead if this parameter is not provided.| fe50b60b-916d-420b-8728-ee2072ec53eb
numberOfTaps | number | no | The number of taps. 1 by default | 2
numberOfTouches | number | no | The number of touch points. 1 by default | 2

#### Examples

=== "Java"

    ```java
    RemoteWebElement e = driver.findElement(AppiumBy.accessibilityId("target element"));
    var result = driver.executeScript("mobile: tapWithNumberOfTaps", Map.of(
        "elementId", e.getId(),
        "numberOfTaps", 2,
        "numberOfTouches", 1,
    ));
    ```

=== "JS (WebdriverIO)"

    ```js
    const e = await $('~target element');
    await driver.executeScript('mobile: tapWithNumberOfTaps', [{
      elementId: e.elementId,
      numberOfTaps: 2,
      numberOfTouches: 1
    }]);
    ```

=== "Python"

    ```python
    e = driver.find_element(by=AppiumBy.ACCESSIBILITY_ID, value='target element')
    driver.execute_script("mobile: tapWithNumberOfTaps", {
      "elementId": e.id,
      "numberOfTaps": 2,
      "numberOfTouches": 1
    })
    ```

=== "Ruby"

    ```ruby
    e = driver.find_element :accessibility_id, 'target element'
    driver.execute_script 'mobile: tapWithNumberOfTaps', {
      elementId: e.ref,
      numberOfTaps: 2,
      numberOfTouches: 1
    }
    ```

=== "C#"

    ```csharp
    var e = driver.FindElement(By.AccessibilityId("target element"))
    driver.ExecuteScript("mobile: touchAndHold", new Dictionary<string, object>() {
        {"elementId", element.Id},
        {"numberOfTaps", 2 },
        {"numberOfTouches", 1 },
    });
    ```

- numberOfTaps=1, numberOfTouches=1 -> "vanilla" single tap
- numberOfTaps=2, numberOfTouches=1 -> double tap
- numberOfTaps=3, numberOfTouches=1 -> triple tap
- numberOfTaps=2, numberOfTouches=2 -> double tap with two fingers

#### Reference
[tapWithNumberOfTaps:numberOfTouches:](https://developer.apple.com/documentation/xctest/xcuielement/1618671-tapwithnumberoftaps)

### mobile: forcePress

Emulates force press on the given element/coordinates.
An error is thrown if the target device does not support force press gesture.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId | string | no | The internal element identifier (as hexadecimal hash string) to perform one or more taps. It is expected that both x and y are provided if this argument is omitted. If the element identifier is provided without coordinates then the actual element's touch point will be calculated automatically by WebDriverAgent. | fe50b60b-916d-420b-8728-ee2072ec53eb
x | number | no | x coordinate of the gesture. It is calculated relatively to the given element (if provided). Otherwise the gesture destination point is calculated relatively to the active application. | 100
y | number | no | y coordinate of the gesture. It is calculated relatively to the given element (if provided). Otherwise the gesture destination point is calculated relatively to the active application | 100
duration | number | no | The float number of seconds the force press action would take. If duration is provided then it is also expected that a custom pressure value is provided as well. `0.5` by default. | 2.5
pressure | number | no | The float number defining how much pressure to apply. If pressure is provided then it is also expected that a custom duration value is provided as well. `1.0` by default | 1.5

### mobile: scrollToElement

Scrolls the current viewport to the given element. It is expected the destination element is inside a scrollable container and is hittable. The scroll direction is detected automatically.
This API uses native XCTest calls, so it performs scrolling pretty fast. The same native call is
implicitly performed by a vanilla `click` API if the destination element is out of the current viewport. An exception is thrown if the scrolling action cannot be performed.
This extension is available since the driver version 4.7.0.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId | string | yes | The internal element identifier (as hexadecimal hash string) to scroll to. The destination element must be located in a scrollable container and must be hittable. If the element is already present in the current viewport then no action is performed. | fe50b60b-916d-420b-8728-ee2072ec53eb

### mobile: resetLocationService

Reset the location service on real device since Appium 1.22.0.
It could delay a few seconds to reflect the location by the system.
It raises an error if the device is simulator or an error occurred during the reset.

### mobile: enableConditionInducer

Important: Device conditions are available for real devices running iOS 13.0 and later.

This API is going to throw an error if it is called while another condition inducer has been already enabled and is not explicitly disabled.

```
mobile: enableConditionInducer
mobile: disableConditionInducer
mobile: listConditionInducers
```

The above three extensions are available since the driver version 4.9.0.

You can create a condition on a connected device to test your app under adverse conditions, such as poor network connectivity or thermal constraints.

When you start a device condition, the operating system on the device behaves as if its environment has changed. The device condition remains active until you stop the device condition or disconnect the device. For example, you can start a device condition, run your app, monitor your app's energy usage, and then stop the condition.

Reference: [Test under adverse device conditions (iOS)](https://help.apple.com/xcode/mac/current/#/dev308429d42)

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
conditionID | string | yes | Get the conditionID parameter through the command `mobile: availableConditionInducer`   | SlowNetworkCondition
profileID | string | yes | Get the profileID parameter through the command `mobile: availableConditionInducer`     | SlowNetwork100PctLoss

#### Returned Result

Either `true` or `false`, where `true` means enabling of the condition inducer has been successful

### mobile: listConditionInducers

Get all condition inducer configuration profiles

#### Returned Result

The response looks like

```
[{
    "profiles": [
        {
            "name": "100% packet loss",
            "identifier": "SlowNetwork100PctLoss",   // enableConditionInducer profileID
            "description": "Name: 100% Loss Scenario
                            Downlink Bandwidth: 0 Mbps
                            Downlink Latency: 0 ms
                            Downlink Packet Loss Ratio: 100%
                            Uplink Bandwidth: 0 Mbps
                            Uplink Latency: 0 ms
                            Uplink Packet Loss Ratio: 100%"
        },
    ],
    "profilesSorted": true,
    "identifier": "SlowNetworkCondition",   // enableConditionInducer conditionID
    "isDestructive": false,
    "isInternal": false,
    "activeProfile": "",
    "name": "Network Link",
    "isActive": false
}]
```

### mobile: disableConditionInducer

Disable device condition inducer.

Usually a persistent connection is maintained after enable the condition inducer, and this method is only valid for this connection.

If the connection is disconnected, condition inducer will be automatically disabled

#### Returned Result

Either `true` or `false`, where `true` means disabling of the condition inducer has been successful

### mobile: calibrateWebToRealCoordinatesTranslation

Calibrates web to real coordinates translation.
This API can only be called from Safari web context.
It must load a custom page to the browser, and then restore
the original one, so don't call it if you can potentially
lose the current web app state.
The outcome of this API is then used if `nativeWebTap` capability/setting is enabled.
The returned value could also be used to manually transform web coordinates
to real device ones in client scripts.

It is advised to call this API at least once before changing the device orientation
or device screen layout as the recetly received value is cached for the session lifetime
and may become obsolete.

It is advised to enable `nativeWebTapStrict` capability/setting to speed up dynamic coordinates
transformation if you use this extension.

#### Returned Result

An object with three properties used to properly shift Safari web element coordinates into native context:
- `offsetX`: Webview X offset in real coordinates
- `offsetY`: Webview Y offset in real coordinates
- `pixelRatioX`: Webview X pixel ratio
- `pixelRatioY`: Webview Y pixel ratio

The following formulas are used for coordinates translation:
`RealX = offsetX + webviewX * pixelRatioX`
`RealY = offsetY + webviewY * pixelRatioY`

### mobile: updateSafariPreferences

Updates preferences of Mobile Safari on Simulator

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
preferences | map | yes | An object containing Mobile Safari preferences to be updated. The list of available setting names and their values could be retrieved by changing the corresponding Safari settings under Preferences-&gt;Safari and then inspecting `Library/Preferences/com.apple.mobilesafari.plist` file inside of `com.apple.mobilesafari` app container. The full path to the Mobile Safari's container could be retrieved from `xcrun simctl get_app_container <sim_udid> com.apple.mobilesafari data` command output. Use the `xcrun simctl spawn <sim_udid> defaults read <path_to_plist>` command to print the actual .plist content to the Terminal. | { ShowTabBar: 0, WarnAboutFraudulentWebsites: 0 }

### mobile: deepLink

Opens the given URL with the default or the given application.
This functionality is only available since xcuitest driver version 4.17.
Xcode must be at version 14.3+ and iOS must be at version 16.4+.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
url | string | yes | The URL to be opened. This parameter is manadatory. | https://apple.com, myscheme:yolo
bundleId | string | no | The bundle identifier of an application to open the given url with. If not provided then the default application for the given url scheme is going to be used. | com.myapp.yolo

### mobile: getSimulatedLocation

Retrieves simulated geolocation value.
This functionality is only available since xcuitest driver version 4.18.
Xcode must be at version 14.3+ and iOS must be at version 16.4+.

#### Returned Result

This API returns a map with the following entries:

Name | Type | Description | Example
--- | --- | --- | ---
latitude | number | Measurement of distance north or south of the Equator. `null` if [mobile: setSimulatedLocation](#mobile-setsimulatedlocation) has not been called before or the simulated geolocation has been reset by [mobile: resetSimulatedLocation](#mobile-resetsimulatedlocation). | 50.08546
longitude | number | Measurement of distance east or west of the prime meridian. `null` if [mobile: setSimulatedLocation](#mobile-setsimulatedlocation) has not been called before or the simulated geolocation has been reset by [mobile: resetSimulatedLocation](#mobile-resetsimulatedlocation).  | -20.12345

### mobile: setSimulatedLocation

Sets simulated geolocation value.
This functionality is only available since xcuitest driver version 4.18.
Xcode must be at version 14.3+ and iOS must be at version 16.4+.

It is recommended for iOS 17+ real devices to simulate the device location.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
latitude | number | yes | Measurement of distance north or south of the Equator. | 50.08546
longitude | number | yes | Measurement of distance east or west of the prime meridian. | -20.12345

### mobile: resetSimulatedLocation

Resets the previously set simulated geolocation value.
This functionality is only available since xcuitest driver version 4.18.
Xcode must be at version 14.3+ and iOS must be at version 16.4+.

> **Warning**
> Do not forget to reset the simulated geolocation value after your automated test is finished.
> If the value is not reset explicitly then the simulated one will remain until the next device restart.

### mobile: getAppStrings

Retrieves string resources for the given app language. An error is thrown if strings cannot be fetched or no strings exist
for the given language abbreviation

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
language | string | no | The language abbreviation to fetch app strings mapping for. If no language is provided then strings for the 'en language would be returned | fr
stringFile | string | no | Relative path to the corresponding .strings file starting from the corresponding .lproj folder | base/main.strings

#### Returned Result

App strings map, where keys are resource identifiers.

### mobile: hideKeyboard

Tries to hide the on-screen keyboard. Throws an exception if the keyboard cannot be hidden. On non-tablet devices the keyboard might not have an explicit button to hide it. In such case this API won't work and the only way to close the keyboard would be to simulate the same action an app user would do to close it. For example, swipe from top to bottom or tap the screen somewhere at the area not covered by the keyboard.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
keys | string[] | no | One or more keyboard key names used to close/hide it. On tablet's such button is usually called 'done'.

### mobile: isKeyboardShown

Checks if the system on-screen keyboard is visible.

#### Returned Result

`true` if the keyboard is visible

### mobile: keys

Send keys to the given element or to the application under test.
This API is only supported since Xcode 15/iOS 17.
It is not supported on tvOS.
The API only works on iPad. On iOS calling it has no effect.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
elementId | string | no | Unique identifier of the element to send the keys to. If unset then keys are sent to the current application under test. | 21045BC8-013C-43BD-9B1E-4C6DC7AB0744
keys | array | yes | Array of keys to type. Each item could either be a string, that represents a key itself (see the official documentation on XCUIElement's [typeKey:modifierFlags: method](https://developer.apple.com/documentation/xctest/xcuielement/1500604-typekey?language=objc) and on [XCUIKeyboardKey constants](https://developer.apple.com/documentation/xctest/xcuikeyboardkey?language=objc)) or a dictionary with `key` and `modifierFlags` entries, if the key should also be entered with modifiers. | ['h', 'i'] or [{key: 'h', modifierFlags: 1 << 1}, {key: 'i', modifierFlags: 1 << 2}] or ['XCUIKeyboardKeyEscape'] |

!!! note

    The `modifierFlags` argument is of `unsigned long` type and defines the bitmask with depressed modifier keys for the given key.
    XCTest defines the following possible bitmasks for modifier keys:

    <pre>
    typedef NS_OPTIONS(NSUInteger, XCUIKeyModifierFlags) {
       XCUIKeyModifierNone       = 0,
       XCUIKeyModifierCapsLock   = (1UL << 0),
       XCUIKeyModifierShift      = (1UL << 1),
       XCUIKeyModifierControl    = (1UL << 2),
       XCUIKeyModifierOption     = (1UL << 3),
       XCUIKeyModifierCommand    = (1UL << 4),
       XCUIKeyModifierFunction   = (1UL << 5),
       // These values align with UIKeyModifierFlags and CGEventFlags.
       XCUIKeyModifierAlphaShift = XCUIKeyModifierCapsLock,
       XCUIKeyModifierAlternate  = XCUIKeyModifierOption,
    };
    </pre>

    So, for example, if you want Ctrl and Shift to be depressed while entering your key then `modifierFlags` should be set to
    `(1 << 1) | (1 << 2)`, where the first constant defines `XCUIKeyModifierShift` and the seconds
    one - `XCUIKeyModifierControl`. We apply the [bitwise or](https://www.programiz.com/c-programming/bitwise-operators#or)
    (`|`) operator between them to raise both bitflags
    in the resulting value. The [left bitshift](https://www.programiz.com/c-programming/bitwise-operators#left-shift)
    (`<<`) operator defines the binary bitmask for the given modifier key.
    You may combine more keys using the same approach.

### mobile: lock

Lock the device (and optionally unlock it after a certain amount of time). Only simple (e.g. without a password) locks are supported.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
seconds | number|string | no | The number of seconds after which to unlock the device. Set to `0` or leave it empty to require manual unlock (e.g. do not block and automatically unlock afterwards). | 5

### mobile: unlock

Unlocks the previously locked device. Only simple (e.g. without a password) locks are supported.

### mobile: isLocked

Determine whether the device is locked.

#### Returned Result

Either `true` or `false`

### mobile: shake

Shakes the device. This functionality is only supported on simulators.

### mobile: backgroundApp

Puts the app to the background and waits the given number of seconds. Then restores the app
if necessary. The call is blocking.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
seconds | number | no | The amount of seconds to wait between putting the app to background and restoring it. Any negative value means to not restore the app after putting it to background (the default behavior). | 5

### mobile: performAccessibilityAudit

Performs accessibility audit of the current application according to the given type or multiple types.
Wraps the XCTest's [performAccessibilityAuditWithAuditTypes](https://developer.apple.com/documentation/xctest/xcuiapplication/4190847-performaccessibilityauditwithaud?language=objc) API.
Only available since Xcode 15/iOS 17.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
auditTypes | string[] | no | One or more type names to perform the audit for. The full list of available names could be found in the official [XCTest API documentation](https://developer.apple.com/documentation/xctest/xcuiaccessibilityaudittype?language=objc). If no type if provided explicitly then `XCUIAccessibilityAuditTypeAll` is assumed. | ['XCUIAccessibilityAuditTypeContrast', 'XCUIAccessibilityAuditTypeElementDetection']

#### Returned Result

List of found issues or an empty list. Each list item is a map consisting of the following items:

Name | Type | Description | Example
--- | --- | --- | ---
detailedDescription | string | The detailed description of the found accessibility issue. | Some longer issue description
compactDescription | string | The compact description of the found accessibility issue. | Some compact issue description
auditType | string or number | The name of the audit type this issue belongs to. Could be a number if the type name is unknown. | 'XCUIAccessibilityAuditTypeContrast'
element | string | The description of the element this issue was found for. | 'Yes' button
elementDescription | string | The debug description of the element this issue was found for. Available since driver version | A long string describing the element itself and its position in the page tree hierarchy
elementAttributes | dict | JSON object containing various attributes of the element. | See the example below

```json
"elementAttributes":{
    "isEnabled":"1",
    "isVisible":"1",
    "isAccessible":"0",
    "frame":"{{129, 65}, {135, 18}}",
    "isFocused":"0",
    "rect":{
        "y":65,
        "x":129,
        "width":135,
        "height":18
    },
    "value":"Some Button",
    "label":"Some Button",
    "type":"StaticText",
    "name":"Some Button",
    "rawIdentifier":null
}
```

### mobile: startXCTestScreenRecording

Start a new screen recording via XCTest.

Since this feature is based on the native implementation provided by Apple
it provides the best quality for the least performance penalty in comparison
to alternative implementations.

Even though the feature is available for real devices
there is no possibility to delete video files stored on the device yet,
which may lead to internal storage overload.
That is why it was put under the `xctest_screen_record` security
feature flag if executed from a real device test.

If the screen recording is already running this API is a noop.

The feature is only available since Xcode 15/iOS 17.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
fps | number | no | The Frames Per Second value for the resulting video. Providing higher values will create video files that are greater in size, but with smoother transitions. It is highly recommended to keep this value is range 1-60. 24 by default | 60

#### Returned Result

The API response consists of the following entries:

Name | Type | Description | Example
--- | --- | --- | ---
uuid | string | Unique identifier of the video being recorded | 1D988774-C7E2-4817-829D-3B835DDAA7DF
fps | number | FPS value | 24
codec | number | The magic for the used codec. Value of zero means h264 video codec is being used | 0
startedAt | number | The timestamp when the screen recording has started in float seconds since Unix epoch | 1709826124.123

### mobile: getXCTestScreenRecordingInfo

Retrieves information about the current running screen recording.
If no screen recording is running then `null` is returned.

#### Returned Result

Same as for [mobile: startXCTestScreenRecording](#mobile-startxctestscreenrecording)

### mobile: stopXCTestScreenRecording

Stops the current XCTest screen recording previously started by the
[mobile: startXctestScreenRecording](#mobile-startxctestscreenrecording) API.

An error is thrown if no screen recording is running.

The resulting movie is returned as base-64 string or is uploaded to
a remote location if corresponding options have been provided.

The resulting movie is automatically deleted from the local file system **FOR SIMULATORS ONLY**.
In order to clean it up from a real device it is necessary to properly
shut down XCTest by calling `GET /wda/shutdown` API to the WebDriverAgent server running
on the device directly or by doing device factory reset.

#### Arguments

Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
remotePath | string | no | The path to the remote location, where the resulting .mov file should be uploaded. The following protocols are supported: http/https, ftp Null or empty string value (the default setting) means the content of resulting file should be encoded as Base64 and passed to the endpoint response value. An exception will be thrown if the generated file is too big to fit into the available process memory. | https://myserver/upload
user | string | no | The name of the user for the remote authentication. Only works if `remotePath` is provided. | myuser
pass | string | no | The password for the remote authentication. Only works if `remotePath` is provided. | mypassword
method | string | no | The http multipart upload method name. Only works if `remotePath` is provided. `PUT` by default | POST
headers | dict | no | Additional headers mapping for multipart http(s) uploads | {'User-Agent': 'Myserver 1.0'}
fileFieldName | string | no | The name of the form field, where the file content BLOB should be stored for http(s) uploads. `file` by default | payload
formFields | dict or array | no | Additional form fields for multipart http(s) uploads | {'field2': 'value2'}

#### Returned Result

Same as for [mobile: startXCTestScreenRecording](#mobile-startxctestscreenrecording) plus the below entry:

Name | Type | Description | Example
--- | --- | --- | ---
payload | string | Base64-encoded content of the recorded media file if `remotePath` parameter is empty/null or an empty string otherwise. The resulting media is expected to a be a valid QuickTime movie (.mov). | `YXBwaXVt....`

### mobile: simctl

Runs the given command as a subcommand of `xcrun simctl` against the device under test.
Does not work for real devices.

#### Arguments
Name | Type | Required | Description | Example
--- | --- | --- | --- | ---
command | string | yes | a subcommand for the `simctl`. Available commands are boot, get_app_container, getenv, icloud_sync, install, install_app_data, io, keychain, launch, location, logverbose, openurl, pbcopy, pbpaste, privacy, push, shutdown, spawn, status_bar, terminate, ui, and uninstall. Please check each usage details with `xcrun simctl help`. | `'getenv'`
args | array | no | array of string as arguments for the command after `<device>`. For example `getenv` subcommand accept `simctl getenv <device> <variable name>`. The `<device>` will be filled out automatically. This `args` should be the ` <variable name>` part only. | `['HOME']`
timeout | number | no | Command timeout in milliseconds. If the command blocks for longer than this timeout then an exception is going to be thrown. The default timeout is `600000` ms. | `10000`

#### Returned Result

Name | Type | Description | Example
--- | --- | --- | ---
stdout | string | The standard output of the command. | `'/Users/user/Library/Developer/CoreSimulator/Devices/60EB8FDB-92E0-4895-B466-0153C6DE7BAE/data\n'`
stderr | string | The standard error of the command. | `''` (an empty string)
code | string | The status code of the command. | `0`
