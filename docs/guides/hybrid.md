---
title: Automating Hybrid Apps
---

One of the core principles of XCUITest driver is that you shouldn't have to change your
app to test it. In line with that methodology, it is possible to test hybrid
apps the same way you can with Selenium for web apps. There is a bit of technical
complexity required so that XCUITest driver knows whether you want to automate the native
aspects of the app or the web views. But, thankfully, we can stay within the
Selenium WebDriver protocol for everything.

Once the test is in a web view context the command set that is available is the
full [Selenium](http://www.seleniumhq.org/) [WebDriver API](https://www.w3.org/TR/webdriver/).

### Requirements

To interact with a web view XCUITest driver establishes a connection using a custom
[remote debugger](https://github.com/appium/appium-remote-debugger).
This debugger can connect directly to any WebKit debugger socket exposed by the system.
The protocol used for the communication there is a proprietary Apple's JSON RPC similar
to Chrome's [Devtools Protocol](https://chromedevtools.github.io/devtools-protocol/).
Not all web views expose debugger web sockets by default thus making them invisible
for the XCUITest driver and not showing in the available contexts list.
Make sure the following prerequisites are satisfied if you are unsure about whether
the particular web view is debuggable or not:

- If you use real devices then make sure the Settings→Safari→Advanced→Web Inspector
  checkbox is turned on.
- If your app's web view is based on WKWebView then make sure the
  [isInspectable](https://developer.apple.com/documentation/webkit/wkwebview/4111163-inspectable?language=objc) property of it set to `true`. Note, that you must have access to the application sources in order
  to ensure that!
- Make sure you see the corresponding web view in Safari's
  [remote debugger](https://help.salesforce.com/s/articleView?id=000391692&type=1) list.

If all the above requirements have been satisfied, but the desired web view is still not present in the
XCUITest driver's context list then there is probably an issue in the driver itself, which must be reported
to driver maintainers.

### Entering the web view context

Here are the steps required to talk to a web view in your XCUITest driver test:

1. Navigate to a portion of your app where a web view is active
2. Retrieve the currently available contexts
    * This returns a list of contexts we can access, like `'NATIVE_APP'` or `'WEBVIEW_1'`
3. Set the id of the context you want to access
    * This puts your XCUITest session into a mode where all commands are
      interpreted as being intended for automating the web view, rather than the
      native portion of the app. For example, if you run `findElement`, it
      will operate on the DOM of the web view, rather than return native elements.
      Of course, certain WebDriver methods only make sense in one context or
      another, so in the wrong context you will receive an error message.
4. To stop automating in the web view context and go back to automating the
   native portion of the app, simply set the context
   again with the native context id (generally `'NATIVE_APP'`) to leave the web
   context and once again access the native commands.

### Automatically entering the web view context on session start

If your application begins in a web view, and you do not want to automate the
native application before entering it, you can have XCUITest driver automatically enter
the web view context on session initialization by setting the `autoWebview`
[capability](../reference/capabilities.md) to `true`.


### Examples


```java
// java
// assuming we have a set of capabilities
driver = new AppiumDriver(new URL("http://127.0.0.1:4723/"), options);

Set<String> contextNames = driver.getContextHandles();
for (String contextName : contextNames) {
    System.out.println(contextName); //prints out something like NATIVE_APP \n WEBVIEW_1
}
driver.context(contextNames.toArray()[1]); // set context to WEBVIEW_1

//do some web testing
String myText = driver.findElement(By.cssSelector(".green_button")).click();

driver.context("NATIVE_APP");

// do more native testing if we want

driver.quit();
```

```ruby
# ruby_lib_core
# assuming we have a set of capabilities
@driver = Appium::Core.for(url: SERVER_URL, desired_capabilities: capabilities).start_driver
# ruby_lib
# opts = { caps: capabilities, appium_lib: { custom_url: SERVER_URL }}
# @driver = Appium::Driver.new(opts, true).start_driver

# I switch to the last context because its always the webview in our case, in other cases you may need to specify a context
# View the appium logs while running @driver.contexts to figure out which context is the one you want and find the associated ID
# Then switch to it using @driver.switch_to.context("WEBVIEW_6")

Given(/^I switch to webview$/) do
    webview = @driver.available_contexts.last
    @driver.switch_to.context(webview)
end

Given(/^I switch out of webview$/) do
    @driver.switch_to.context(@driver.contexts.first)
end

# Now you can use CSS to select an element inside your webview

And(/^I click a webview button $/) do
    @driver.find_element(:css, ".green_button").click
end
```

```python
# python
# assuming we have an initialized `driver` object for an app

# switch to webview
webview = driver.contexts.last
driver.switch_to.context(webview)

# do some webby stuff
driver.find_element(By.CSS, ".green_button").click

# switch back to native view
driver.switch_to.context(driver.contexts.first)

# do more native testing if we want

driver.quit()
```
