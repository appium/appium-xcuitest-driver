---
title: Audio Capture
---


Appium XCUITest driver provides a possibility to record iOS audio stream and save it to a file,
which could be then retrieved on the client side. Apple does not provide any API to directly
retrieve the audio stream from a Simulator or a real device, but it is possible to redirect that
stream to the host machine, where it could be captured.

* [`mobile: startAudioRecording`](../reference/execute-methods.md#mobile-startaudiorecording)
* [`mobile: stopAudioRecording`](../reference//execute-methods.md#mobile-stopaudiorecording)

## Server Requirements

- The host machine must have [`ffmpeg`](https://www.ffmpeg.org/download.html) installed and added to PATH.
  It can be installed via [`brew`](https://brew.sh/): `brew install ffmpeg`.
- For macOS 10.15+, applications recording Microphone audio need to be explicitly granted this permission.
  This can be done in the following settings menu:

    - macOS < 13: _System Preferences -> Security & Privacy -> Privacy -> Microphone_
    - macOS 13+: _System Settings -> Privacy & Security -> Microphone_

    Ensure that either `ffmpeg` itself or the parent Appium process (e.g. Terminal) is present in that list.

- As this is a potentially insecure feature, it must be explicitly allowed on the server side. See
  [the Appium documentation on Security](https://appium.io/docs/en/latest/guides/security/) for more details.
  The feature name is `audio_record`.

## Simulator Setup

The following steps are necessary to setup iOS Simulator audio capture:

* Install [Soundflower](https://github.com/mattingalls/Soundflower/releases)
* Redirect Simulator audio output to Soundflower: from the main Simulator menu, select
  _I/O -> Audio Output -> Soundflower (2ch)_
* In terminal, run `ffmpeg -f avfoundation -list_devices true -i ""` to get the identifier of the
  `Soundflower (2ch)` device. This identifier prefixed with `:` will be then used as `audioInput`
  argument to `mobile: startAudioRecording` call
* Test that your setup works as expected. Run any audio playback in Simulator and execute the
  following command in Terminal, replacing the `-i` argument value with the one you got from the
  previous step:
  ```
  ffmpeg -t 5 -f avfoundation -i ":1" -c:a aac -b:a 128k -ac 2 -ar 44100 -y ~/Desktop/out.mp4
  ```
  After 5 seconds, a file named `out.mp4` should be created on your desktop, containing the recorded
  audio stream.

## Real Device Setup

The following steps are necessary to setup iOS Real Device audio capture:

* Connect your device to the Mac host with a cable
* Open the _Audio MIDI Setup_ application
    * Via Finder: _Applications -> Utilities -> Audio MIDI Setup_
    * Via terminal: `open -a /System/Applications/Utilities/Audio\ MIDI\ Setup.app`
* Find your phone in the list of devices there and click `Enable` next to it
* In terminal, run `ffmpeg -f avfoundation -list_devices true -i ""` to get the identifier of your
  device in the `AVFoundation audio devices` list. This identifier prefixed with `:` will be then
  used as `audioInput` argument to `mobile: startAudioRecording` call
* Test that your setup works as expected. Run any audio playback on the device and execute the
  following command in Terminal, replacing the `-i` argument value with the value you got from the
  previous step:
  ```
  ffmpeg -t 5 -f avfoundation -i ":1" -c:a aac -b:a 128k -ac 2 -ar 44100 -y ~/Desktop/out.mp4
  ```
  After 5 seconds, a file named `out.mp4` should be created on your desktop, containing the recorded
  audio stream.

!!! note

    Apple does not allow phone calls to be redirected this way. You can only record application or system sounds.

## Further Reading

* <https://github.com/appium/appium-xcuitest-driver/pull/1207>
* <https://www.macobserver.com/tips/quick-tip/iphone-audio-input-mac/>
* <http://www.lorisware.com/blog/2012/04/28/recording-iphone-emulator-video-with-sound/>
