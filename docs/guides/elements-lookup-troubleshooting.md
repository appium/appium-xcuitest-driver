---
title: Elements Lookup Troubleshooting
---

This article helps to resolve possible issues that may pop up while looking up for elements with XCUITest driver,
where the desired element is either not found or not visible in the page source at all.

Since there might be multiple reasons to why an element cannot be found the topic is divided into sections where
each section contains visible symptoms with the list of their possible resolutions.


## Symptom #1

The desired element is shown as part of a bigger container and is not distinguable in the page source tree.
Sometimes the whole application view with all elements in it is visible as one single container.

## Resolutions To Symptom #1

### Make sure the application under test is accessible

The XCUITest driver is based on Apple's XCTest framework. And the latter uses the information provided by the system
accessibility framework to interact with on-screen elements, and to distinguish them. The same approach is used by
various screen readers, VoiceOver, etc. You may start your journey into what Accessibility is and how to deal
with it in your applications from the official
[Apple's accessibility guideline](https://developer.apple.com/design/human-interface-guidelines/accessibility).
Bear in mind, that this tutorial only describes apps based on official Apple frameworks, like UIKit or SwiftUI. If you
use a different framework to build the application's user interface, for example
[React Native](https://reactnative.dev/), then consider looking for framework-specific accessibility guidelines.

### Check if this is a hybrid application

Hybrid applications are applications that use
[web views](https://developer.apple.com/design/human-interface-guidelines/web-views) in order to represent
their whole user interface or portions of it.
Web views is the technology that allows to seamlessly integrate web pages browsing experience
into native mobile applications. Applications might contain native views mixed with web views, or the whole
application UI might be just a single web view. And while the built-in web view engine allows limited accessibility
interactions via [ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA) attributes, consider
switching a driver context instead in order to get full native access to the page DOM.
Read [Automating Hybrid Apps](./hybrid.md) for more details there.

### Make sure the application accessibility tree is not too deep

Apple's XCTest represents the page source as hierarchical structure (a tree), where each UI element has ancestor and
descendant relationships to other elements. There are applications having complex UI structure with deeply nested
views. Such deep structures are known to create problems for XCTest as the latter is unable to work with tree elements
whose nesting level is deeper than `62`. This limitation has to do with how `NSDictionary` works and cannot be worked
around. The default maximum nesting level for the XCUITest driver is set to `50` and could be customized by the
[snapshotMaxDepth](../reference/settings.md) setting.
[React Native](https://reactnative.dev/) is known to create
such deep hierarchies and the only viable solution for now is to fix the application
under test by flattening nested views. Check the corresponding [issue](https://github.com/appium/appium/issues/14825)
for more details.
Deeply nested hierarchies might also be the reason for the element lookup slowness. Read the [Diagnosing WebDriverAgent Slowness](./wda-slowness.md) article to troubleshoot the latter.


## Symptom #2

The desired element is shown in the page tree, but cannot be found if looked up from an automated test.

## Resolutions To Symptom #2

### Make sure there is no race condition

Sometimes the automation might too fast or too slow depending on in which state the UI is while the lookup is being
executed. If it is too fast then consider using lookup timers, e.g. repeat the `findElement` more than once until
either the element is found or the timeout occurs. All clients have convenience wrappers for such timers in form of
expected conditions.
If the automation is too slow, e.g. the desired element disappears faster than `findElement` could detect its presence
then make sure your script is optimized for the maximum performance, e.g. optimal/fast element locators are used,
the application itself and driver settings are [adjusted](./wda-slowness.md) to perform optimally, etc.
There might be situations where the automation framework is already optimized, although the desired element is
a short-living one, for example some notification popup that only appears for a second and then is immidiely hidden.
For such "special" elements consider using approaches different from `findElement`, for example post-test video recording analysis (video FPS should usually be enough to catch all short-living elements), or introducing special
application debug settings to change the behavior for such elements and make them stay visible for longer time, or
using non-UI-related assertions, like logs analysis or direct API calls.

### Make sure the debug environment matches to the testing one

There are known cases where application interface/behavior might differ in simulators and real devices. It might even differ
if the screen size or device model/OS version/system setting differs. That is why always make sure your debug
environment, for example one where Appium Inspector is used,
is as close as possible to the environment where automated tests are being executed.
