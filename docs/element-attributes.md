---
title: Element Attributes
---

XCUITest driver supports the following element attributes:

Name | Description | Example
--- | --- | ---
name | Could contain either element's [identifier](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500981-identifier?language=objc) or its [label](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500692-label?language=objc), depending on which one is available first. Could also be `null`. It is recommended to prefer the usage of [accessibilityIdentifier](https://developer.apple.com/documentation/uikit/uiaccessibilityidentification/1623132-accessibilityidentifier) over [accessibilityLabel](https://developer.apple.com/documentation/objectivec/nsobject/1615181-accessibilitylabel) for automation purposes, since the `identifier` property is supposed to stay constant under different locales and does not affect accessibility services such as VoiceOver. | 'hello'
label | Element's [label](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500692-label?language=objc) value. Could be `null`. Since XCUITest driver 4.7.3 (WebDriverAgent 4.8.0), the behavior of this value was better aligned with XCTest, so it could include line breaks (`\n`). Before this version, line breaks were replaced by spaces. | 'hello', 'hello\nworld'
type | Element's [type](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500614-elementtype?language=objc) name | 'XCUIElementTypeButton'
visible | Whether the element is visible. This value is not available in the "vanilla" XCTest and is read directly from the accessibility layer | 'false'
focused | Whether the element is [focused](https://developer.apple.com/documentation/xctest/xcuielementattributes/1627636-hasfocus?language=objc). *Only available for tvOS prior to driver version 4.25.4* | 'true'
accessible | Whether the element is accessible. This value is not available in the "vanilla" XCTest and is read directly from the accessibility layer | 'true'
enabled | Whether the element is [enabled](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500330-enabled?language=objc). | 'false'
selected | Whether the element is [selected](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500581-selected?language=objc) | 'false'
index | Element's index in the hierarchy relatively to its parent. Only available since Appium 1.20.0. Indexing starts from `0`. | '2'
rect | Element's rectangle. The actual data of this attribute is based on element's [frame](https://developer.apple.com/documentation/xctest/xcuielementattributes/1500911-frame?language=objc). | {'x': 0, 'y': 0, 'width': 100, 'height': 100}
value | Element's value. This is a complex attribute, whose calculation algorithm depends on the actual element type. Check [WebDriverAgent sources](https://github.com/appium/WebDriverAgent/blob/master/WebDriverAgentLib/Categories/XCUIElement%2BFBWebDriverAttributes.m) to know more about how it is compiled (method `- (NSString *)wdValue`). Could be `null` | 'hello'
hittable | Whether the element is [hittable](https://developer.apple.com/documentation/xctest/xcuielement/1500561-hittable). This attribute is not included into the XML page source due to performance reasons, although you can use it in element locators or fetch its value using [getAttribute](https://www.w3.org/TR/webdriver2/#get-element-attribute) API. *Only available since driver version 4.35*.  | 'true'
