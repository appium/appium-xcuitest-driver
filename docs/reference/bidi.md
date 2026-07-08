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

There are 3 types of supported network events, each of which has its own shape. Event shapes match
[the NetworkEvent types used in `appium-ios-remotexpc`](https://github.com/appium/appium-ios-remotexpc/blob/main/src/lib/types.ts).

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

All event entries include the `type` field, which is used to distinguish them:

| Type| <div style="width:10em">Name</div> | Meaning |
| --- | --- | --- |
| `0` | Interface detection | An interface appeared or was reported (index + kernel name). |
| `1` | Connection detection | A local/remote socket pair was observed (addresses, PID, interface, serial). |
| `2` | Connection update | Counters and RTT for an existing flow; correlate with detection via `connectionSerial`. |

#### Interface Detection Event

```cddl
appium:xcuitest.networkMonitor.InterfaceDetectionEntry = {
  type: 0,
  interfaceIndex: js-uint,
  name: text,
}
```

| Parameter | Description |
| -- | -- |
| `interfaceIndex` | Interface index |
| `name` | Interface name |

#### Connection Detection Event

```cddl
appium:xcuitest.networkMonitor.ConnectionDetectionEntry = {
  type: 1,
  localAddress: appium:xcuitest.networkMonitor.NetworkAddress,
  remoteAddress: appium:xcuitest.networkMonitor.NetworkAddress,
  interfaceIndex: js-uint,
  pid: js-uint,
  recvBufferSize: js-uint,
  recvBufferUsed: js-uint,
  serialNumber: js-uint,
  kind: js-uint,
}
```

| Parameter | Description |
| -- | -- |
| `localAddress` | Local address information |
| `remoteAddress` | Remote address information |
| `interfaceIndex` | Interface index |
| `pid` | ID of the process owning the connection |
| `recvBufferSize` | Receive buffer size |
| `recvBufferUsed` | Receive buffer used |
| `serialNumber` | Connection serial number |
| `kind` | Connection kind/type |

```cddl
appium:xcuitest.networkMonitor.NetworkAddress = {
  len: js-uint,
  family: js-uint,
  port: js-uint,
  address: text,
  flowInfo: js-uint,
  scopeId: js-uint,
}
```

| Parameter | Description |
| -- | -- |
| `len` | Length of the address structure |
| `family` | Address family |
| `port` | Port number |
| `address` | Parsed IP address string |
| `flowInfo` | Flow info (IPv6 only) |
| `scopeId` | Scope ID (IPv6 only) |

IPv4/IPv6 addresses are normalized strings; `family` is the raw `sockaddr` family (e.g. `2` = IPv4,
`30` = IPv6).

#### Connection Update Event

```cddl
appium:xcuitest.networkMonitor.ConnectionUpdateEntry = {
  type: js-uint,
  rxPackets: js-uint,
  rxBytes: js-uint,
  txPackets: js-uint,
  txBytes: js-uint,
  rxDups: js-uint,
  rx000: js-uint,
  txRetx: js-uint,
  minRtt: js-uint,
  avgRtt: js-uint,
  connectionSerial: js-uint,
  time: js-uint,
}
```

| Parameter | Description |
| -- | -- |
| `rxPackets` | Number of received packets |
| `rxBytes` | Number of received bytes |
| `txPackets` | Number of transmitted packets |
| `txBytes` | Number of transmitted bytes |
| `rxDups` | Number of duplicate received packets |
| `rx000` | Reserved field |
| `txRetx` | Number of retransmitted packets |
| `minRtt` | Minimum round-trip time |
| `avgRtt` | Average round-trip time |
| `connectionSerial` | Connection serial number |
| `time` | Timestamp |

You can use the value of `connectionSerial` to link back to a prior `type: 1` event with a matching
`serialNumber` value.
