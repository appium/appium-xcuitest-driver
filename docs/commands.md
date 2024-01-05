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

`POST` **`/session/:sessionId/appium/device/get_clipboard`**

Gets the content of the primary clipboard on the device under test.
See [Get/Set Clipboard](./clipboard.md) for more details

#### Arguments

| Name | Type |
| :------ | :------ |
| `contentType?` | `any` |

#### Returned Result

`string`

The actual clipboard content encoded into base64 string. An empty string is returned if the
clipboard contains no data.

### `setClipboard`

`POST` **`/session/:sessionId/appium/device/set_clipboard`**

Sets the primary clipboard's content on the device under test.
See [Get/Set Clipboard](./clipboard.md) for more details

#### Arguments

| Name | Type | Description |
| :------ | :------ | :------ |
| `content` | `any` | - |
| `contentType?` | `any` | - |
| `label?` | `string` | The content to be set as base64 encoded string. |

#### Returned Result

``null``

### `toggleEnrollTouchId`

`POST` **`/session/:sessionId/appium/simulator/toggle_touch_id_enrollment`**

Toggle whether the device is enrolled in the touch ID program

#### Arguments

| Name | Type | Default value |
| :------ | :------ | :------ |
| `enabled?` | `any` | `true` |

#### Returned Result

``null``

### `touchId`

`POST` **`/session/:sessionId/appium/simulator/touch_id`**

Trigger a touch/fingerprint match or match failure

#### Arguments

| Name | Type | Default value |
| :------ | :------ | :------ |
| `match` | `any` | `true` |

#### Returned Result

``null``

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

### `click`

`POST` **`/session/:sessionId/touch/click`**

Click/tap an element

**`See`**

[https://w3c.github.io/webdriver/#element-click](https://w3c.github.io/webdriver/#element-click)

#### Arguments

| Name | Type |
| :------ | :------ |
| `element` | `any` |

#### Returned Result

`any`

### `background`

!!! note

    We recommended using the [`mobile: backgroundApp`](./execute-methods.md#mobile-backgroundapp) extension instead

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

!!! note

    We recommended using the [`mobile: queryAppState`](./execute-methods.md#mobile-queryappstate) extension instead

`POST` **`/session/:sessionId/appium/device/app_state`**

Get the running state of an app

#### Returned Result

`AppState`

A number representing the state. `0` means not installed, `1` means not running, `2`
means running in background but suspended, `3` means running in the background, and `4` means
running in the foreground

### `isLocked`

!!! note

    We recommended using the [`mobile: isLocked`](./execute-methods.md#mobile-islocked) extension instead

`POST` **`/session/:sessionId/appium/device/is_locked`**

Determine whether the device is locked

#### Returned Result

`boolean`

`true` if the device is locked, `false` otherwise

### `lock`

!!! note

    We recommended using the [`mobile: lock`](./execute-methods.md#mobile-lock) extension instead

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

!!! note

    We recommended using the [`mobile: unlock`](./execute-methods.md#mobile-unlock) extension instead

`POST` **`/session/:sessionId/appium/device/unlock`**

Unlock the device

<!-- comment source: method-signature -->

#### Returned Result

``null``

### `mobileShake`

!!! note

    We recommended using the [`mobile: shake`](./execute-methods.md#mobile-shake) extension instead

`POST` **`/session/:sessionId/appium/device/shake`**

Shake the device

#### Returned Result

``null``

### `getStrings`

!!! note

    We recommended using the [`mobile: getAppStrings`](./execute-methods.md#mobile-getappstrings) extension instead

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

### `performMultiAction`

!!! warning "Deprecated"

    This method is deprecated. Please use `performActions` instead

`POST` **`/session/:sessionId/touch/multi/perform`**

Perform a set of touch actions

#### Arguments

| Name | Type |
| :------ | :------ |
| `actions` | `any` |
| `elementId?` | `any` |

#### Returned Result

`unknown`

### `performTouch`

!!! warning "Deprecated"

    This method is deprecated. Please use `performActions` instead

`POST` **`/session/:sessionId/touch/perform`**

Perform a set of touch actions

#### Arguments

| Name | Type |
| :------ | :------ |
| `actions` | `any` |

#### Returned Result

`unknown`