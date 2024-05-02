---
title: Diagnosing WebDriverAgent Slowness
---

The XCUITest driver is based on Apple's [XCTest](https://developer.apple.com/documentation/xctest)
test automation framework and thus inherits most (if not all) properties and features this framework
provides. The purpose of this article is to help with optimization of automation scenarios that
don't perform well and/or to explain possible causes of such behavior.

## "Slowness" could be different

First, it is important to figure out what exactly is slow.
The Appium ecosystem is complicated and
consists of multiple layers, where each layer could influence the overall duration.
For example, when an API call is invoked from a client script, it must go through the following stages:

Your automation script (Java, Python, C#, etc; runs on your machine)
--> Appium Client Lib (Java, Python, C#, etc; runs on your machine)
--> Appium Server (Node.js HTTP server; runs on your machine or a remote one)
--> XCUITest Driver and/or Plugin (Node.js HTTP handler; runs on your machine or a remote one)
--> WDA Server (ObjectiveC HTTP Server; runs on the remote mobile device)

The example above is the simplest flow. If you run your scripts using cloud providers
infrastructure then the amount of intermediate components in this chain may be much greater.
Like it was mentioned above, it is very important to know on which stage(s)
(or between them) the bottleneck is observed.

This particular article focuses only on the last stage: the WDA Server one.

## WebDriverAgent (WDA) Server

WDA source code is located in the separate [repository](https://github.com/appium/WebDriverAgent/tree/master).
The content of this repository is published as [appium-webdriveragent](https://www.npmjs.com/package/appium-webdriveragent)
NPM package and contains several helper Node.js modules along with the WDA source code itself.
This source code is compiled into an .xctrunner bundle, which is a special application type
that contains tests (also it has some higher privileges in comparison to vanilla apps).
WebDriverAgent project itself consists of three main parts:

- Vendor Libs
- WebDriverAgentLib
- WebDriverAgentRunner

Vendor libs, like RoutingHTTPServer, ensure the support for low-level HTTP- and TCP-server APIs.
WebDriverAgentLib defines handlers for [W3C WebDriver](https://www.w3.org/TR/webdriver/) endpoints
and implements all the heavy-lifting procedures related to Apple's XCTest communication
and some more custom stuff specific for the XCUITest driver.
WebDriverAgentRunner is actually one long test, whose main purpose
is to run the HTTP server implemented by the WebDriverAgentLib.

Important conclusions from the above information:

- WDA is an HTTP server, which executes API commands by invoking HTTP response handlers
- WDA uses Apple's XCTest APIs with various custom additions

## How to confirm my script's bottleneck is WDA

Check the server logs in order to verify how long it takes for the XCUITest driver to receive a
response from WDA. The log line that is written before an HTTP request is proxied to WDA looks
like `Proxying [X] to [Y]`. Also consider enabling server timestamps by providing the
`--log-timestamp` command line parameter. If you observe timestamps between the above log line and the
next one differ too much and the difference is an anomaly (e.g. the same step is (much) faster
for other apps/environments/parameter combinations) then it might serve as a confirmation of a
suspicious slowness.

## Patterns lookup

After the slowness is confirmed it is important to determine behavior patterns, e.g. under which
circumstances does it happen, if it is always reproducible, etc. This article only targets specific
patterns that the author knows of or dealt with. If your pattern is not present here then try to
look for possible occurrences in existing [issues](https://github.com/appium/appium/issues),
[Appium forum](https://discuss.appium.io) or just search the internet.

## Pattern: Application startup is slow

### Symptoms

You observe timeouts or unusual slowness (in comparison to manual execution performance)
of the application startup on session init (if it also includes app startup)
or mid-session app startup.

### Causes

When XCTest starts an app it ensures the accessibility layer of it is ready for interactions.
To check that the framework verifies the application is idling (e.g. does not perform any actions
on the main thread) as well as all animations have been finished. If this check times out
an exception is thrown or WDA may try to continue without any guarantees the app could be
interacted with (a.k.a. best effort strategy).

### Solutions

I was observing applications that were constantly running something on the main thread in an endless loop.
Most likely such apps are not automatable at all or hardly automatable without fixing the app
source code itself.
You may still try to tune the following capabilities and settings to influence the above timeout:

- [appium:waitForIdleTimeout](../reference/capabilities.md)
- [waitForIdleTimeout](../reference/settings.md)
- [animationCoolOffTimeout](../reference/settings.md)

## Pattern: Element location with XPath is slow

### Symptoms

You observe timeouts or unusual slowness (in comparison to other location strategies)
of XPath locators.

### Causes

The [XPath](../reference/locator-strategies.md) location strategy
is not natively supported by XCTest. It's a custom addition
which is only available in WDA. Such locators have more features than others, but the price
for it is the observed slowness as we cannot rely on native XCTest location APIs
while looking for element using XPath.
In order to perform XPath lookup WDA needs to take a snapshot of the whole accessibility
hierarchy with all element attributes resolved, which is a time-expensive operation.
Location slowness might be observed if:
- The current app hierarchy is too large (e.g. has hundreds of elements). This is a known
  XCTest limitation.
- The app is not idling/has active animations
- It takes too long to determine each element's `visible` or `accessible` attributes, which are custom
  ones and are not present in the original XCTest implementation

### Solutions

Depending on the actual cause there might be different applicable solutions. In general, the common
advice would be to avoid XPath locators where possible and use locators that are natively
supported by XCTest (like predicates or ids) and have better speed ranking.
If the usage of an XPath locators is a single available option then you may try to apply the following
suggestions:
- Reduce the size of the app hierarchy using the [snapshotMaxDepth setting](../reference/settings.md).
  This might not help if the destination element is deeply nested -
  it won't be found if the value of this setting is lower than its nesting level.
- Exclude the `visible` and/or `accessible` attributes from your query. These are
  custom attributes exclusive to WDA and their calculation is expensive in comparison
  to other native attributes.
- Reduce various timeouts similarly to how it's advised in the
  [Application startup is slow](#pattern-application-startup-is-slow) pattern
- Fix the source code of the application under test to reduce the amount of accessible elements
  on a single screen
- Fix the source code of the application under test to avoid running long operations
  or animations on the main thread

## Pattern: Element location with non-XPath is slow

### Symptoms

You observe timeouts or unusual slowness with various non-XPath locators.

### Causes

Location slowness might be observed if:
- The current app hierarchy is too large (e.g. has hundreds of elements). This is a known
  XCTest limitation.
- The app is not idling/has active animations
- It takes too long to determine each element's `visible` or `accessible` attributes, which are custom
  ones and are not present in the original XCTest implementation (only applicable to predicate and class chain locators)

### Solutions

- Reduce the size of the app hierarchy using the [snapshotMaxDepth setting](../reference/settings.md).
  This might not help if the destination element is deeply nested -
  it won't be found if the value of this setting is lower than its nesting level.
- Exclude the `visible` and/or `accessible` attributes from your query
  (only applicable to predicate and class chain locators). These are
  custom attributes exclusive to WDA and their calculation is expensive in comparison
  to other native attributes.
- Reduce various timeouts similarly to how it's advised in the
  [Application startup is slow](#pattern-application-startup-is-slow) pattern
- Fix the source code of the application under test to reduce the amount of accessible elements
  on a single screen
- Fix the source code of the application under test to avoid running long operations
  or animations on the main thread

## Pattern: Various element interactions are slow

### Symptoms

You observe timeouts or unusual slowness while clicking elements or performing other
actions on them.

### Causes

- The current app hierarchy is too large (e.g. has hundreds of elements). This is a known
  XCTest limitation.
- The app is not idling/has active animations

### Solutions

- Reduce various timeouts similarly to how it's advised in the
  [Application startup is slow](#pattern-application-startup-is-slow) pattern
- Fix the source code of the application under test to reduce the amount of accessible elements
  on a single screen
- Fix the source code of the application under test to avoid running long operations
  or animations on the main thread

## Pattern: Page source retrieval slow

### Symptoms

You observe timeouts or unusual slowness while retrieving the page of the app.

### Causes

In order to retrieve the page source WDA needs to take a snapshot of the whole accessibility
hierarchy with all element attributes resolved, which is a time-expensive operation.
Page source retrieval slowness might be observed if:
- The current app hierarchy is too large (e.g. has hundreds of elements). This is a known
  XCTest limitation.
- The app is not idling/has active animations
- It takes too long to determine each element's `visible` or `accessible` attributes, which are custom
  ones and are not present in the original XCTest implementation

### Solutions

- Reduce the size of the app hierarchy using the [snapshotMaxDepth setting](../reference/settings.md).
  Note that you won't see nested elements in the source tree whose nesting level is lower than
  the given size.
- Retrieve the page source without "expensive" attributes using the
  [mobile: source](../reference/execute-methods.md#mobile-source) method with
  the appropriate `excludedAttributes` argument value or add such attribute names into
  the [pageSourceExcludedAttributes setting](../reference/settings.md).
- Retrieve the native XCTest page source using the
  [mobile: source](../reference/execute-methods.md#mobile-source) method with
  the `format=description` argument value. The returned page source is a poorly-formatted text,
  although its retrieval should be fast (at least not slower than XCTest does that).
- Reduce various timeouts similarly to how it's advised in the
  [Application startup is slow](#pattern-application-startup-is-slow) pattern
- Fix the source code of the application under test to reduce the amount of accessible elements
  on a single screen
- Fix the source code of the application under test to avoid running long operations
  or animations on the main thread
