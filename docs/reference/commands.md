---
title: Commands
---

The driver comes with a set of many available commands, in addition to the commands included in the
Appium base driver. Refer to the documentation of your Appium client for the exact syntax to call
these commands.

Please note that most of the driver-specific functionality is available using
[Execute Methods](./execute-methods.md) instead.

!!! info

    Check the [Appium base driver documentation](https://appium.io/docs/en/latest/reference/commands/base-driver/)
    for commands inherited by the XCUITest driver

### `getClipboard`

!!! warning "Deprecated"

    This method is deprecated. Please use [`mobile: getClipboard`](./execute-methods.md#mobile-getclipboard) extension instead

`POST` **`/session/:sessionId/appium/device/get_clipboard`**

Gets the content of the primary clipboard on the device under test.
See [Get/Set Clipboard](../guides/clipboard.md) for more details

#### Arguments

| Name | Type |
| :------ | :------ |
| `contentType?` | `any` |

#### Returned Result

`string`

The actual clipboard content encoded into base64 string. An empty string is returned if the
clipboard contains no data.

### `setClipboard`

!!! warning "Deprecated"

    This method is deprecated. Please use [`mobile: setClipboard`](./execute-methods.md#mobile-setclipboard) extension instead

`POST` **`/session/:sessionId/appium/device/set_clipboard`**

Sets the primary clipboard's content on the device under test.
See [Get/Set Clipboard](../guides/clipboard.md) for more details

#### Arguments

| Name | Type | Description |
| :------ | :------ | :------ |
| `content` | `any` | - |
| `contentType?` | `any` | - |
| `label?` | `string` | The content to be set as base64 encoded string. |

#### Returned Result

``null``

### `getGeoLocation`

`GET` **`/session/:sessionId/location`**

Returns the location of the device under test. Location Services for WebDriverAgent must be set to
'Always' to get the location data correctly.

The 'latitude', 'longitude' and 'altitude' could be zero even if the Location Services are set to
'Always', because the device may need some time to update the location data.

For iOS 17+ simulators and real devices, this method will return the result of
[`mobile: getSimulatedLocation`](./execute-methods.md#mobile-getsimulatedlocation) extension
if the simulated location was previously set by [`mobile: setSimulatedLocation`](./execute-methods.md#mobile-setsimulatedlocation).

**`Throws`**

If the device under test returns an error message. i.e.: tvOS returns unsupported error

#### Returned Result

`Promise`<`altitude`: `number`, `latitude`: `number`, `longitude`: `number`\>

### `setGeoLocation`

`POST` **`/session/:sessionId/location`**

Set location of the device under test.

For iOS 17+ real devices, this method will call the
[`mobile: setSimulatedLocation`](./execute-methods.md#mobile-setsimulatedlocation) extension.

#### Arguments

| Name | Type | Description |
| :------ | :------ | :------ |
| `location` | `Location` | An object with `latitude` and `longitude` values |

#### Returned Result

`Promise`<`altitude`: `number`, `latitude`: `number`, `longitude`: `number`\>

### `startRecordingScreen`

`POST` **`/session/:sessionId/appium/start_recording_screen`**

Start recording the device screen. This functionality is available in the iOS Simulator since
Xcode 9, and in real devices since iOS 11.

Screen activity is recorded to an MPEG-4 file. Note that audio is not recorded with the video file.
If the screen recording has already been started, this command will force stop it and start a new
recording. The previously recorded video file will also be deleted.

!!! info

    This command requires the `ffmpeg` utility to be installed (`brew install ffmpeg`)

**`Throws`**

If the screen recording has failed to start.

#### Arguments

| Name | Type |
| :------ | :------ |
| `options?` | `any` |

#### Returned Result

`string`

Base64-encoded content of the recorded media file if any screen recording is currently running,
or an empty string.

### `stopRecordingScreen`

`POST` **`/session/:sessionId/appium/stop_recording_screen`**

Stop an ongoing screen recording and return the video. This functionality is available in the iOS
Simulator since Xcode 9, and in real devices since iOS 11.


If no screen recording process is running, the command will attempt to retrieve the most recently
recorded file. If no previously recorded file is found, the method will return an empty string.

**`Throws`**

If there was an error while getting the name of a media file, or the file content cannot be uploaded
to the remote location.

#### Arguments

| Name | Type |
| :------ | :------ |
| `options?` | `any` |

#### Returned Result

``null`` \| `string`

Base64-encoded content of the recorded media file if `remotePath` parameter is empty or null,
or an empty string.

### `getSize`

`GET` **`/session/:sessionId/element/:elementId/size`**

Get the size of an element

#### Returned Result

`Size`

The positions of the element

### `submit`

`POST` **`/session/:sessionId/element/:elementId/submit`**

Submit the form an element is in

#### Returned Result

``null``

### `background`

!!! note

    We recommend using the [`mobile: backgroundApp`](./execute-methods.md#mobile-backgroundapp) extension instead

`POST` **`/session/:sessionId/appium/app/background`**

Close app (simulate device home button). It is possible to restore
the app after the timeout or keep it minimized based on the parameter value.

#### Arguments

| Name | Type |
| :------ | :------ |
| `seconds` | `any` |

#### Returned Result

`unknown`

### `queryAppState`

!!! warning "Deprecated"

    This method is deprecated. Please use [`mobile: queryAppState`](./execute-methods.md#mobile-queryappstate) extension instead

`POST` **`/session/:sessionId/appium/device/app_state`**

Get the running state of an app

#### Returned Result

`AppState`

A number representing the state. `0` means not installed, `1` means not running, `2`
means running in background but suspended, `3` means running in the background, and `4` means
running in the foreground

### `isLocked`

!!! warning "Deprecated"

    This method is deprecated. Please use [`mobile: isLocked`](./execute-methods.md#mobile-islocked) extension instead

`POST` **`/session/:sessionId/appium/device/is_locked`**

Determine whether the device is locked

#### Returned Result

`boolean`

`true` if the device is locked, `false` otherwise

### `lock`

!!! warning "Deprecated"

    This method is deprecated. Please use [`mobile: lock`](./execute-methods.md#mobile-lock) extension instead

`POST` **`/session/:sessionId/appium/device/lock`**

Lock the device (and optionally unlock the device after a certain amount of time)

**`Default Value`**

0

#### Arguments

| Name | Type |
| :------ | :------ |
| `seconds?` | `any` |

#### Returned Result

``null``

### `unlock`

!!! warning "Deprecated"

    This method is deprecated. Please use [`mobile: unlock`](./execute-methods.md#mobile-unlock) extension instead

`POST` **`/session/:sessionId/appium/device/unlock`**

Unlock the device

<!-- comment source: method-signature -->

#### Returned Result

``null``

### `mobileShake`

!!! warning "Deprecated"

    This method is deprecated. Please use [`mobile: shake`](./execute-methods.md#mobile-shake) extension instead

`POST` **`/session/:sessionId/appium/device/shake`**

Shake the device

#### Returned Result

``null``

### `getStrings`

!!! note

    We recommend using the [`mobile: getAppStrings`](./execute-methods.md#mobile-getappstrings) extension instead

`POST` **`/session/:sessionId/appium/app/strings`**

Return the language-specific strings for an app

#### Arguments

| Name | Type | Default value | Description |
| :------ | :------ | :------ | :------ |
| `language?` | `any` | `undefined` | - |
| `stringFile?` | `string` | `null` | The language abbreviation to fetch app strings mapping for. If no language is provided then strings for the 'en language would be returned |

#### Returned Result

`StringRecord`<`string`\>

A record of localized keys to localized text

### `setValueImmediate`

!!! warning "Deprecated"

    This method is deprecated

`POST` **`/session/:sessionId/appium/element/:elementId/value`**

#### Arguments

| Name | Type |
| :------ | :------ |
| `text` | `any` |

#### Returned Result

``null``

### `keys`

!!! warning "Deprecated"

    This method is deprecated. Please use `setValue` instead

`POST` **`/session/:sessionId/keys`**

Send keys to the app

#### Arguments

| Name | Type |
| :------ | :------ |
| `value` | `any` |

#### Returned Result

``null``

### `receiveAsyncResponse`

!!! warning "Deprecated"

    This method is deprecated

`POST` **`/session/:sessionId/appium/receive_async_response`**

Collect the response of an async script execution

#### Arguments

| Name | Type |
| :------ | :------ |
| `response` | `any` |

#### Returned Result

``null``

### `toggleEnrollTouchId`

!!! warning "Deprecated"

    This method is deprecated. Please use the [`mobile: enrollBiometric`](./execute-methods.md#mobile-enrollbiometric) extension instead

`POST` **`/session/:sessionId/appium/simulator/toggle_touch_id_enrollment`**

Toggle whether the device is enrolled in the touch ID program

#### Arguments

| Name | Type | Default value |
| :------ | :------ | :------ |
| `enabled?` | `any` | `true` |

#### Returned Result

``null``

### `touchId`

!!! warning "Deprecated"

    This method is deprecated. Please use the [`mobile: sendBiometricMatch`](./execute-methods.md#mobile-sendbiometricmatch) extension instead

`POST` **`/session/:sessionId/appium/simulator/touch_id`**

Trigger a touch/fingerprint match or match failure

#### Arguments

| Name | Type | Default value |
| :------ | :------ | :------ |
| `match` | `any` | `true` |

#### Returned Result

``null``

### `asyncScriptTimeout`

!!! warning "Deprecated"

    This method is deprecated. Please use `scriptTimeoutW3C` instead

`POST` **`/session/:sessionId/timeouts/async_script`**

Alias for XCUITestDriver.scriptTimeoutW3C.

#### Arguments

| Name | Type |
| :------ | :------ |
| `ms` | `any` |

#### Returned Result

``null``

### `getLocation`

!!! warning "Deprecated"

    This method is deprecated. Please use `getElementRect` instead

`GET` **`/session/:sessionId/element/:elementId/location`**

Get the position of an element on screen

#### Returned Result

`Position`

The position of the element

### `getLocationInView`

!!! warning "Deprecated"

    This method is deprecated. Please use `getElementRect` instead

`GET` **`/session/:sessionId/element/:elementId/location_in_view`**

Alias for `getLocation`

#### Returned Result

`Position`

The position of the element

### `getWindowSize`

!!! warning "Deprecated"

    This method is deprecated. Please use `getElementRect` instead

`GET` **`/session/:sessionId/window/:windowhandle/size`**

Get the window size

#### Returned Result

`any`
