---
hide:
    - toc

title: Media Streaming over BiDi
---

[`mobile: startMediaStream`](../reference/execute-methods.md#mobile-startmediastream) sends the screen to the
client as [WebDriver BiDi events](../reference/bidi.md#appiummediastreamstarted) instead of serving it over a
host port. It supports both `jpeg` frames (an MJPEG-like stream) and H.264/HEVC `video` with optional AAC audio.
The event contract is the same as in the Android drivers, so one client implementation works with both.

!!! note

    **Simulators** (Xcode 26+) and **real devices** running iOS/tvOS 27+ are supported, with the same events.
    Use [`mobile: getMediaStreamCapabilities`](../reference/execute-methods.md#mobile-getmediastreamcapabilities)
    to find out what the current session offers.

1. Start a session with BiDi enabled (`webSocketUrl: true`) and subscribe to the `appium:mediaStream` module.
2. Call `mobile: startMediaStream` with `kind` set to `jpeg` or `video`.
3. Handle the `appium:mediaStream.units` events. JPEG units are complete images. Video units are Annex-B and
   every keyframe carries the codec configuration, so decoding can begin at any keyframe.
4. Call `mobile: stopMediaStream` when done. Streams are also stopped when the session ends.

Every unit is base64-encoded into a JSON message, so this costs more CPU and bandwidth than the plain
[WDA MJPEG server](mjpeg.md). A full resolution `jpeg` stream of a modern iPhone is about 250 KB per frame, so
pick a lower `scale` and `fps`, or prefer `video` for long or high resolution streams.

Notes:

- Subscribe first and only then start the stream, since events are only emitted while a client is subscribed.
- A static screen produces no new frames. The `jpeg` stream repeats the last frame every `idleHeartbeatMs`, and a
  `video` stream sends nothing until the screen changes.
- The simulator encoder sends a keyframe about every 2 seconds on a changing screen, so a client that joins late
  waits for the next one.
- Appium closes the connection with code `1013` if the client cannot keep up with the stream, and closes it
  when the session is deleted, so no `ended` event follows a session deletion.

## Real devices

A real device needs a [RemoteXPC tunnel](remotexpc-tunnels-real-devices.md) and the optional `@appium/media-proxy`
package. The device streams HEVC, which the driver transcodes to H.264 or JPEG, so on a device:

- Only the `h264` codec is available. With `audio: true` the device's AAC-ELD audio is transcoded to AAC-LC (48 kHz
  stereo, ADTS), as on a simulator.
- The stream is upright and cropped to the visible display: the device always sends the display's native portrait
  buffer, padded with black to a multiple of 16 pixels, and the driver rotates and crops it. When the device rotates, the
  driver notices within about a second, turns the stream, and sends
  [`appium:mediaStream.formatChanged`](../reference/bidi.md#appiummediastreamformatchanged) with the new size. A video
  stream also starts a new GOP with a keyframe.
- The device sends a single keyframe when it starts and none afterwards, and its picture can become damaged during
  large screen changes (an app launch, a rotation) and stay that way. The driver therefore asks the device for a keyframe
  every 2 seconds, which is also what gives a late subscriber a keyframe within about 100 ms.
- The animation iOS plays while rotating is part of the stream, so a few tilted or briefly glitchy frames follow a rotation.
- Decoding the device's HEVC stream is done in software and costs roughly half a CPU core at 60 fps.
