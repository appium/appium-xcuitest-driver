---
title: BiDi Protocol Support
---

XCUITest driver has partial support of the [BiDi Protocol](https://w3c.github.io/webdriver-bidi/) since version 7.26.0.
Only events and commands mentioned below are supported.
All other entities described in the spec throw not implemented errors.

# Supported Events

## log.entryAdded

This event is emitted if the driver retrieves a new entry for any of the below log types. Logs collection might be disabled by the `appium:skipLogCapture` capability.

### crashlog

Events are emitted for both emulator and real devices. The latter only works if [py-ios-device](https://github.com/YueChen-C/py-ios-device) is installed on the server host. Each event contains a particular device crash report entry.
Events are always emitted with the `NATIVE_APP` context.

### syslog

Events are emitted for both emulator and real devices. Each event contains a single device system log line.
Events are always emitted with the `NATIVE_APP` context.

### safariConsole

Events are emitted for both emulator and real devices. Each event contains a single Safari console log line.
Events are always emitted with the appropriate web context name from which they were generated.
Events are only emitted if the `appium:showSafariConsoleLog` capability value is provided.

### safariNetwork

Events are emitted for both emulator and real devices. Each event contains a single Safari network log line.
Events are always emitted with the appropriate web context name from which they were generated.
Events are only emitted if the `appium:showSafariNetworkLog` capability value is provided.

### performance

Events are emitted for both emulator and real devices. Each event contains a single Safari performance log line.
Events are always emitted with the appropriate web context name from which they were generated.
Events are only emitted if the `appium:enablePerformanceLogging` capability value is provided.

### server

Events are emitted for both emulator and real devices. Each event contains a single Appium server log line.
Events are always emitted with the `NATIVE_APP` context.
Events are only emitted if the `get_server_logs` server security feature is enabled.

## appium.contextUpdate

This event is emitted upon the context change, either explicit or implicit.
The event is always emitted upon new session initialization.
See the [GitHub feature ticket](https://github.com/appium/appium/issues/20741) for more details.

The event contains the following params:

### name

Contains the actual name of the new context, for example `NATIVE_APP`.

### type

Either `NATIVE` or `WEB` depending on which context is currently active in the driver session.
