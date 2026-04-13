---
title: BiDi Events
---

The XCUITest driver has partial support of the [WebDriver BiDi Protocol](https://w3c.github.io/webdriver-bidi/).
Only the events and commands mentioned below are supported. All other entities described in the
specification throw not implemented errors.

For other BiDi events recognized by the Appium server, see
[their Appium docs reference page](https://appium.io/docs/en/latest/reference/api/bidi/).

## log.entryAdded

This event is emitted if the driver retrieves a new entry for any of the below log types. Logs collection might be disabled by the `appium:skipLogCapture` capability.

### crashlog

Events are emitted for both emulator and real devices. On real devices, crash logs require **iOS/tvOS 18+** and the optional [`appium-ios-remotexpc`](https://github.com/appium/appium-ios-remotexpc) package (driver v11 removed the previous `py-ios-device` integration). Each event contains a particular device crash report entry.
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

## appium:xcuitest.contextUpdate

This event is emitted upon the context change, either explicit or implicit.
The event is always emitted upon new session initialization.
See the [GitHub feature ticket](https://github.com/appium/appium/issues/20741) for more details.

### CDDL

```cddl
appium:xcuitest.contextUpdated = {
  method: "appium:xcuitest.contextUpdated",
  params: {
    name: text,
    type: "NATIVE" / "WEB",
  },
}
```

The event contains the following params:

### name

Contains the actual name of the new context, for example `NATIVE_APP`.

### type

Either `NATIVE` or `WEB` depending on which context is currently active in the driver session.

## appium:xcuitest.networkMonitor

Emitted once per sample from Apple’s DVT networking instrument (`com.apple.instruments.server.services.networking`) while [`mobile: startNetworkMonitor`](./execute-methods.md#mobile-startnetworkmonitor) is active. **Not** a packet capture: you receive structured **interface**, **connection**, and **statistics** events (similar to Instruments’ network activity view), not raw PCAP bytes.

**Requirements:** real device, **iOS/tvOS 18+**, and [`appium-ios-remotexpc`](https://github.com/appium/appium-ios-remotexpc) installed on the Appium host. Stop the stream with [`mobile: stopNetworkMonitor`](./execute-methods.md#mobile-stopnetworkmonitor). Events use the `NATIVE_APP` context.

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
