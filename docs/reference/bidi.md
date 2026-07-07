---
title: BiDi Commands and Events
---

The XCUITest driver has partial support of the [WebDriver BiDi Protocol](https://w3c.github.io/webdriver-bidi/).
It inherits [the BiDi commands and events supported by the Appium base driver](https://appium.io/docs/en/latest/reference/api/bidi/),
and additionally defines the events and commands listed below.

## Events

### log.entryAdded

> WebDriver BiDi documentation: [log.entryAdded](https://w3c.github.io/webdriver-bidi/#event-log-entryAdded)

Indicates that a new log entry is available for consumption.

This event is emitted when the driver retrieves a new entry for any of the log types listed below. 
Log capture can also be disabled using the [`appium:skipLogCapture`](./capabilities.md) capability.

#### Event Type (CDDL)

```cddl
log.entryAded = (
  context: text,
  method: "log.entryAdded",
  params: {
    type: text,
    level: "debug" / "info" / "warn" / "error",
    source: {
      realm: '',
      context: text,
    },
    text: text,
    timestamp: js-uint,
  },
)
```

| Parameter | Description |
| -- | -- |
| `context` | The context in which the log was created, usually either native or webview |
| `type` | One of the supported log types listed below |
| `text` | Contents of the log entry |
| `timestamp` | Timestamp of the log entry |

#### Supported Types

Event emission of all of these log types is supported for both real devices and emulators.

* `crashlog`
    * Each event contains a particular device crash report entry
    * `context` is always set to `NATIVE_APP`
    * Real devices must have iOS/tvOS 18 or later, and the `appium-ios-remotexpc` package must be installed. Refer to the [RemoteXPC Tunnels guide](../guides/remotexpc-tunnels-real-devices.md) for more details.
* `syslog`
    * Each event contains a single device system log line
    * `context` is always set to `NATIVE_APP`
* `safariConsole`
    * Each event contains a single Safari console log line
    * `context` is always set to the appropriate web context name
    * Events are only emitted if the [`appium:showSafariConsoleLog`](./capabilities.md) capability is set
* `safariNetwork`
    * Each event contains a single Safari network log line
    * `context` is always set to the appropriate web context name
    * Events are only emitted if the [`appium:showSafariNetworkLog`](./capabilities.md) capability is set
* `performance`
    * Each event contains a single Safari performance log line
    * `context` is always set to the appropriate web context name
    * Events are only emitted if the [`appium:enablePerformanceLogging`](./capabilities.md) capability is set
* `server`
    * Each event contains a single Appium server log line
    * `context` is always set to `NATIVE_APP`
    * Events are only emitted if the [`get_server_logs`](./security-flags.md) insecure feature is enabled

### appium:xcuitest.contextUpdated

Indicates a change in the current Appium context.

This event is emitted upon context change, either explicit or implicit. It is also emitted at the
start of a new session.

See the [GitHub feature ticket](https://github.com/appium/appium/issues/20741) for more details.

#### Event Type (CDDL)

```cddl
appium:xcuitest.contextUpdated = (
  method: "appium:xcuitest.contextUpdated",
  params: {
    name: text,
    type: "NATIVE" / "WEB",
  },
)
```

| Parameter | Description |
| -- | -- |
| `name` | The name of the new context |
| `type` | The type of the currently active context. Supported values are `NATIVE` or `WEB`. |

### appium:xcuitest.networkMonitor

Indicates that a new network event is available for consumption.

This event is continuously emitted as soon as the [`mobile: startNetworkMonitor`](./execute-methods.md#mobile-startnetworkmonitor) is invoked. Event emission stops as soon as the [`mobile: stopNetworkMonitor`](./execute-methods.md#mobile-stopnetworkmonitor)
execute method is called.

Events are only supported for real devices running iOS/tvOS 18 or later, and the
`appium-ios-remotexpc` package must be installed. Refer to the [RemoteXPC Tunnels guide](../guides/remotexpc-tunnels-real-devices.md)
for more details.

#### Event Type (CDDL)

The CDDL defines 3 types of network events, each of which has its own shape.

```cddl
appium:xcuitest.networkMonitor = (
  method: "appium:xcuitest.networkMonitor",
  context: "NATIVE_APP",
  params: {
    event: {
      appium:xcuitest.networkMonitor.InterfaceDetectionEntry /
      appium:xcuitest.networkMonitor.ConnectionDetectionEntry /
      appium:xcuitest.networkMonitor.ConnectionUpdateEntry
    },
  },
)
```

Each BiDi notification has `method: "appium:xcuitest.networkMonitor"` and `params.event`, where `params.event.type` discriminates the payload:

| `type` | Name | Meaning |
| --- | --- | --- |
| `0` | Interface detection | An interface appeared or was reported (index + kernel name). |
| `1` | Connection detection | A local/remote socket pair was observed (addresses, PID, interface, serial). |
| `2` | Connection update | Counters and RTT for an existing flow; correlate with detection via `connectionSerial`. |

### Example: interface detection (`type: 0`)

```json
{
  "method": "appium:xcuitest.networkMonitor",
  "params": {
    "event": {
      "type": 0,
      "interfaceIndex": 25,
      "name": "utun5"
    }
  },
  "context": "NATIVE_APP"
}
```

### Example: connection detection (`type: 1`)

IPv4/IPv6 addresses are normalized strings; `family` is the raw `sockaddr` family (e.g. `2` = IPv4, `30` = IPv6).

```json
{
  "method": "appium:xcuitest.networkMonitor",
  "params": {
    "event": {
      "type": 1,
      "localAddress": {
        "len": 28,
        "family": 30,
        "port": 50063,
        "address": "fdc2:1118:d2ac::1",
        "flowInfo": 0,
        "scopeId": 0
      },
      "remoteAddress": {
        "len": 28,
        "family": 30,
        "port": 443,
        "address": "2600:1900::",
        "flowInfo": 0,
        "scopeId": 0
      },
      "interfaceIndex": 25,
      "pid": 1234,
      "recvBufferSize": 131072,
      "recvBufferUsed": 4096,
      "serialNumber": 42,
      "kind": 1
    }
  },
  "context": "NATIVE_APP"
}
```

### Example: connection update (`type: 2`)

Use `connectionSerial` to tie updates back to a prior `type: 1` event’s `serialNumber` when you need per-flow accounting.

```json
{
  "method": "appium:xcuitest.networkMonitor",
  "params": {
    "event": {
      "type": 2,
      "rxPackets": 120,
      "rxBytes": 98304,
      "txPackets": 80,
      "txBytes": 8192,
      "rxDups": 0,
      "rx000": 0,
      "txRetx": 2,
      "minRtt": 12,
      "avgRtt": 18,
      "connectionSerial": 42,
      "time": 1690000000000
    }
  },
  "context": "NATIVE_APP"
}
```

Field names and semantics match [`appium-ios-remotexpc`’s `NetworkEvent` types](https://github.com/appium/appium-ios-remotexpc/blob/main/src/lib/types.ts) (interface / connection detection / connection update).

### CDDL (shape)

Matches the object emitted on the driver event bus (same top-level fields as the JSON examples above), including `context`.

```cddl
appium:xcuitest.networkMonitor = {
  method: "appium:xcuitest.networkMonitor",
  context: text,
  params: {
    event: {
      type: 0 / 1 / 2,
      ; type 0: interfaceIndex, name
      ; type 1: localAddress, remoteAddress, interfaceIndex, pid, recvBufferSize, recvBufferUsed, serialNumber, kind
      ; type 2: rxPackets, rxBytes, txPackets, txBytes, rxDups, rx000, txRetx, minRtt, avgRtt, connectionSerial, time
    },
  },
}
```
