---
hide:
  - toc

title: Biometric Authentication
---

The XCUITest driver has the capability to simulate biometric authentication, such as
[Touch ID](https://support.apple.com/en-us/102528) and [Face ID](https://support.apple.com/en-us/108411).

!!! note

    This functionality is only supported on simulators that support either Touch ID or Face ID.

The driver provides the following execute methods for managing biometric authentication:

* [`mobile: enrollBiometric`](../reference/execute-methods.md#mobile-enrollbiometric)
* [`mobile: sendBiometricMatch`](../reference/execute-methods.md#mobile-sendbiometricmatch)
* [`mobile: isBiometricEnrolled`](../reference/execute-methods.md#mobile-isbiometricenrolled)

Basic use case:

1. Call `mobile: enrollBiometric`
    * By default, this enrolls the device
    * Set `isEnabled` to `false` to unenroll
2. Call `mobile: sendBiometricMatch`
    * By default, this simulates a Touch ID match
    * Set `type` to either `touchId` or `faceId`, depending on your device
    * Set `match` to `true` or `false` to trigger a match or non-match, respectively
