---
title: WebDriverAgent Slowness
---

The XCUITest driver is based on Apple's [XCTest](https://developer.apple.com/documentation/xctest)
test automation framework and thus inherits most (if not all) properties and features this framework
provides. The purpose of this article is to help with optimization of automation scenarios that
don't perform well and/or to explain possible causes of such behavior.

!!! note

    This article only covers specific patterns that the author knows of or dealt with. If your pattern
    is not present here, try to look for possible occurrences in existing [issues](https://github.com/appium/appium/issues),
    [Appium forum](https://discuss.appium.io) or just search the internet.

## Context

### How Automation Runs

First, it is important to figure out what exactly is slow. The Appium ecosystem is complicated and
consists of multiple layers, where each layer could influence the overall duration. For example,
when an API call is invoked from a client script, it must go through the following stages:

1. Your automation script (Java, Python, C#, etc; runs on your machine)
2. Appium Client Lib (Java, Python, C#, etc; runs on your machine)
3. Appium Server (Node.js HTTP server; runs on your machine or a remote one)
4. XCUITest Driver (Node.js HTTP handler; runs on your machine or a remote one)
5. WebDriverAgent Server (ObjectiveC HTTP Server; runs on the remote mobile device)

The example above is the simplest flow. If you run your scripts using cloud providers
infrastructure then the amount of intermediate components in this chain may be much greater. As
mentioned above, it is very important to know in which stage(s) (or between them) the bottleneck
is observed.

This article focuses only on the last stage: the WebDriverAgent (WDA) server.

### How WDA Works

The WDA source code is located in [the WebDriverAgent repository](https://github.com/appium/WebDriverAgent/tree/master).
It is published as the [`appium-webdriveragent`](https://www.npmjs.com/package/appium-webdriveragent)
NPM package, and contains several helper Node.js modules, along with the WDA source code itself.
This source code is compiled into an `.xctrunner` bundle, which is a special application type that
contains tests, and has some higher privileges in comparison to standard apps. The project itself
consists of three main parts:

- Vendor Libraries (e.g. RoutingHTTPServer)
    - Ensure support for low-level HTTP- and TCP-server APIs
- WebDriverAgentLib
    - Defines handlers for [W3C WebDriver](https://www.w3.org/TR/webdriver/) endpoints and implements
    all the heavy-lifting procedures related to Apple's XCTest communication, plus some custom
    handling specific for the XCUITest driver
- WebDriverAgentRunner
    - An XCTest test that runs the HTTP server implemented by the WebDriverAgentLib

Important conclusions from the above information:

- WDA is an HTTP server, which executes API commands by invoking HTTP response handlers
- WDA uses Apple's XCTest APIs with various custom additions

### Check If WDA Is the Bottleneck

Examine the Appium server logs and look for lines similar to the following:
```bash
[3716542a][XCUITestDriver@73bc] Proxying [X] to [Y]
```

This line indicates an HTTP request being proxied to WDA, and its duration can identify how long it
takes for the XCUITest driver to receive a response from WDA.

For easier debugging, consider enabling server timestamps by providing the `--log-timestamp` Appium
server parameter.

If you observe timestamps between the above log line and the next one differ too much, and the
difference is an anomaly (e.g. the same step is (much) faster for other apps/environments/parameter
combinations), then it might serve as a confirmation of a suspicious slowness.


## Slow Application Startup

You observe timeouts or unusual slowness (in comparison to manual execution performance)
of the application startup on session initialization (if it also includes app startup)
or mid-session app startup.

### Causes

When XCTest starts an app, it checks that the app's accessibility layer is ready for interactions.
This is done by verifying that the application is idling (e.g. does not perform any actions on the
main thread), as well as whether all animations have been finished.

If this check times out, an exception is thrown, or WDA may try to continue without any guarantees
the app could be interacted with (a.k.a. best effort strategy).

### Solutions

You may try to tune the following capabilities and settings to influence the above timeout:

- [`appium:waitForIdleTimeout`](../reference/capabilities.md) capability
- [`waitForIdleTimeout`](../reference/settings.md) setting
- [`animationCoolOffTimeout`](../reference/settings.md) setting

Still, there are known cases where the application under test is constantly running something on
the main thread in an endless loop. Most likely, such apps are not automatable at all, or hardly
automatable without fixing the app source code itself.


## Slow Page Source Retrieval

You observe timeouts or unusual slowness while retrieving the page source of the app.

### Causes

In order to retrieve the page source, WDA needs to take a snapshot of the whole accessibility
hierarchy with all element attributes resolved, which is a time-expensive operation. The causes for
the slowness are commonly the following:

- The current app hierarchy is too large (e.g. has hundreds of elements). This is a known
  XCTest limitation.
- The app is not idling/has active animations
- It takes too long to determine each element's `visible` or `accessible` attributes, which are
  custom and are not present in the original XCTest implementation

### Solutions

- Reduce the size of the app hierarchy using the [`snapshotMaxDepth`](../reference/settings.md)
  and/or [`snapshotMaxChildren`](../reference/settings.md) settings. The former setting limits how
  deep into the hierarchy WDA will traverse; if the destination element is nested deeper than this
  value, it will not be present in the snapshot. The latter setting limits how many child elements
  are captured for each node; if there are more siblings than this limit, some of them (and any
  elements under them) will be omitted from the snapshot.
- Retrieve the page source without "expensive" attributes using the [`mobile: source`](../reference/execute-methods.md#mobile-source)
  method with the appropriate `excludedAttributes` argument value, or the [`pageSourceExcludedAttributes` setting](../reference/settings.md)
- Retrieve the native XCTest page source using the [`mobile: source`](../reference/execute-methods.md#mobile-source)
  method with the `format=description` argument value. The returned page source will be
  poorly-formatted text, but its retrieval should be fast (at least not slower than XCTest).
- Reduce various timeouts, same as for the [Slow Application Startup pattern](#solutions)
- Adjust the source code of the application under test to reduce the amount of accessible elements
  on a single screen
- Adjust the source code of the application under test to avoid running long operations or
  animations on the main thread


## Slow Element Search Using XPath

You observe timeouts or unusual slowness of XPath locators (in comparison to other location
strategies).

### Causes

The [XPath](../reference/locator-strategies.md) location strategy is not natively supported by
XCTest, and is a custom addition only available in WDA. Even though such locators have more
features than others, the price for it is the observed slowness, as the driver cannot rely on native
XCTest location APIs while looking for elements using XPath.

In order to perform XPath lookup, WDA needs to take a snapshot of the whole accessibility
hierarchy with all element attributes resolved, which is a time-expensive operation.
The causes for the slowness of this operation are mentioned for the [Slow Page Source Retrieval pattern](#causes_1).

### Solutions

In general, the common advice would be to avoid XPath locators where possible, and use locators
that are natively supported by XCTest (such as `id` or `predicate`), which are also more performant.
If using XPath locators is the only option, then the following suggestions may help:

- Reduce the size of the app hierarchy using the [`snapshotMaxDepth`](../reference/settings.md)
  and/or [`snapshotMaxChildren`](../reference/settings.md) settings
- Retrieve the page source without the `visible` and/or `accessible` attributes, using the [`mobile: source`](../reference/execute-methods.md#mobile-source)
  method with the appropriate `excludedAttributes` argument value, or the [`pageSourceExcludedAttributes` setting](../reference/settings.md)
- Reduce various timeouts, same as for the [Slow Application Startup pattern](#solutions)
- Adjust the source code of the application under test to reduce the amount of accessible elements
  on a single screen
- Adjust the source code of the application under test to avoid running long operations or
  animations on the main thread


## Slow Element Search Using Non-XPath

You observe timeouts or unusual slowness with various non-XPath locators.

### Causes

All causes mentioned for the [Slow Page Source Retrieval pattern](#causes_1) also apply here.

### Solutions

All suggestions mentioned for the [Slow Element Search Using XPath pattern](#solutions_2) also apply
here.


## Slow Element Interactions

You observe timeouts or unusual slowness while clicking elements or performing other
actions on them.

### Causes

- The current app hierarchy is too large (e.g. has hundreds of elements). This is a known
  XCTest limitation.
- The app is not idling/has active animations

### Solutions

- Reduce various timeouts, same as for the [Slow Application Startup pattern](#solutions)
- Adjust the source code of the application under test to reduce the amount of accessible elements
  on a single screen
- Adjust the source code of the application under test to avoid running long operations or
  animations on the main thread
