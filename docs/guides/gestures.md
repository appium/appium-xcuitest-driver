---
title: Gestures
---

The XCUITest driver provides multiple options for touch gestures automation.
For simple gestures, like tap by coordinates, long tap, multi-finger tap, double/triple tap,
swipe, drag, rotate, scroll or pinch use the below gesture shortcuts:

- [mobile: tap](../reference/execute-methods.md#mobile-tap)
- [mobile: doubleTap](../reference/execute-methods.md#mobile-doubletap)
- [mobile: touchAndHold](../reference/execute-methods.md#mobile-touchandhold)
- [mobile: twoFingerTap](../reference/execute-methods.md#mobile-twofingertap)
- [mobile: dragFromToForDuration](../reference/execute-methods.md#mobile-dragfromtoforduration)
- [mobile: dragFromToWithVelocity](../reference/execute-methods.md#mobile-dragfromtowithvelocity)
- [mobile: rotateElement](../reference/execute-methods.md#mobile-rotateelement)
- [mobile: tapWithNumberOfTaps](../reference/execute-methods.md#mobile-tapwithnumberoftaps)
- [mobile: forcePress](../reference/execute-methods.md#mobile-forcepress)
- [mobile: scrollToElement](../reference/execute-methods.md#mobile-scrolltoelement)
- [mobile: scroll](../reference/execute-methods.md#mobile-scroll)
- [mobile: pinch](../reference/execute-methods.md#mobile-pinch)

For more sophisticated gestures
consider using [W3C actions](https://w3c.github.io/webdriver/#actions).

Make sure you don't use deprecated JSONWP TouchActions APIs. They have been
removed from the XCUITest driver since version 7.

If the action code in the client source looks good and satisfies the above requirements,
but its execution still does not deliver the expected result then the following debugging
measures might be applied:

- Make sure the gesture has valid coordinates and respects pauses between pointer state changes.
  For example, it is always mandatory to provide a valid element or valid `absolute` coordinates
  to any gesture at the beginning. iOS only registers
  a long touch/click if the pointer has been depressed for longer than 500ms. For shorter actions
  a simple click is registered instead.
- If your tests run on Simulator then it is possible to activate pointer tracing by enabling
  the [appium:simulatorTracePointer](../reference/capabilities.md#simulator) capability or by enabling
  `Visual Indicators` items from Simulator settings. After running
  your automation code with this feature enabled you would be able to see the exact pointer trace path
  and check the velocity of the gesture. Compare the trace
  to how the same gesture is usually done manually and apply the necessary updates to your code.
- Do not mix webview and native elements in actions arguments. It simply won't work. Native
  actions could only consume native elements. A single possibility to perform a native action
  on a web element would be to translate its coordinates into the native context and pass these
  coordinates as native action arguments.

Check the below tutorials for more details on how to build reliable action chains:

- [Automating Complex Gestures with the W3C Actions API](https://appiumpro.com/editions/29-automating-complex-gestures-with-the-w3c-actions-api)
- [Swiping your way through Appium by Wim Selles #AppiumConf2021](https://www.youtube.com/watch?v=oAJ7jwMNFVU)
- [About iOS Input Events](./input-events.md)