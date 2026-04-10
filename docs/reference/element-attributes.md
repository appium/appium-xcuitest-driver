---
title: Element Attributes
---

The XCUITest driver supports various native and custom element attributes.

## type

> Example: `XCUIElementTypeButton`

Corresponds to the element's XCTest [`elementType`](https://developer.apple.com/documentation/xcuiautomation/xcuielementattributes/elementtype)
value.

## name

> Example: `hello`

Corresponds to the element's XCTest [`identifier`](https://developer.apple.com/documentation/xcuiautomation/xcuielementattributes/identifier)
or [`label`](https://developer.apple.com/documentation/xcuiautomation/xcuielementattributes/label)
property, depending on which one is available first. Can be `null`.

For developers, it is recommended to use [`accessibilityIdentifier`](https://developer.apple.com/documentation/uikit/uiaccessibilityidentification/accessibilityidentifier)
over [`accessibilityLabel`](https://developer.apple.com/documentation/objectivec/nsobject-swift.class/accessibilitylabel)
for automation purposes, since the `identifier` property is supposed to stay constant under
different locales, and does not affect accessibility services such as VoiceOver.

In applications written using [React Native](https://reactnative.dev/), this attribute corresponds
to the `testID` property.

## label

> Examples: `hello`, `hello\nworld`

Corresponds to the element's XCTest [`label`](https://developer.apple.com/documentation/xcuiautomation/xcuielementattributes/label)
value. Can be `null`.

## value

> Example: `hello`

This is a complex attribute whose calculation algorithm depends on the actual element type. Check
[WebDriverAgent sources](https://github.com/appium/WebDriverAgent/blob/master/WebDriverAgentLib/Categories/XCUIElement%2BFBWebDriverAttributes.m)
to know more about how it is compiled (method `- (NSString *)wdValue`). Can be `null`.

## placeholderValue

> Example: `Placeholder text`

Corresponds to the element's XCTest [`placeholderValue`](https://developer.apple.com/documentation/xctest/xcuielementattributes/placeholdervalue)
value.

## minValue

> Examples: `0`, `0.0`, `1`

Returns the element's minimum allowed value, typically for controls like sliders or progress indicators.

This attribute is not included in the default page source due to performance reasons, but it
can be added by changing the [`includeMinMaxValueInPageSource`](./settings.md) setting to `true`, or
retrieved using the [Get Element Attribute](https://www.w3.org/TR/webdriver2/#get-element-attribute)
API.

## maxValue

> Examples: `100`, `1.0`

Returns the element's maximum allowed value, typically for controls like sliders or progress indicators.

This attribute is not included in the default page source due to performance reasons, but it
can be added by changing the [`includeMinMaxValueInPageSource`](./settings.md) setting to `true`, or
retrieved using the [Get Element Attribute](https://www.w3.org/TR/webdriver2/#get-element-attribute)
API.

## enabled

> Example: `false`

Corresponds to the element's XCTest [`enabled`](https://developer.apple.com/documentation/xcuiautomation/xcuielementattributes/isenabled)
value.

## selected

> Example: `false`

Corresponds to the element's XCTest [`selected`](https://developer.apple.com/documentation/xcuiautomation/xcuielementattributes/isselected)
value.

## focused

> Example: `true`

Corresponds to the element's XCTest [`hasFocus`](https://developer.apple.com/documentation/xcuiautomation/xcuielementattributes/hasfocus)
value.

## hittable

> Example: `true`

Corresponds to the element's XCTest [`isHittable`](https://developer.apple.com/documentation/xcuiautomation/xcuielement/ishittable)
value.

This attribute is not included in the default page source due to performance reasons, but it can be
added by changing the [`includeHittableInPageSource`](./settings.md) setting to `true`, or
retrieved using the [Get Element Attribute](https://www.w3.org/TR/webdriver2/#get-element-attribute)
API.

Note that `isHittable` requires an element to have the [`isAccessibilityElement`](https://developer.apple.com/documentation/objectivec/nsobject-swift.class/isaccessibilityelement)
property enabled. This means that if the element is on screen, but it sets [`accessibilityElementsHidden`](https://developer.apple.com/documentation/objectivec/nsobject-swift.class/accessibilityelementshidden)
to `false`, then `hittable` will be set to `false`.

## visible

> Example: `false`

Returns whether the element is visible. This value is not available in XCTest and is read directly
from the accessibility layer.

## accessible

> Example: `false`

Returns whether the element is accessible. This value is not available in XCTest and is read
directly from the accessibility layer.

## index

> Example: `2`

Returns the element's index in the hierarchy relatively to its parent. Indexing starts from `0`.

## rect

> Example: `{"x": 0,"y": 0,"width": 100,"height": 100}`

Returns the element's position and dimensions. Based on the element's XCTest [`frame`](https://developer.apple.com/documentation/xcuiautomation/xcuielementattributes/frame)
value.

## traits

> Examples: `Button, Adjustable`, `Button`

Returns an comma-separated string of the element's XCTest [`UIAccessibilityTraits`](https://developer.apple.com/documentation/uikit/uiaccessibilitytraits)
constants.

## customActions

> Example: `Action 1,Action 2`

Returns a comma-separated string of custom accessibility actions attached to the element. Based on
the element's[`accessibilityAction`](https://developer.apple.com/documentation/swiftui/view/accessibilityaction(_:_:))
and [`UIAccessibilityCustomAction`](https://developer.apple.com/documentation/uikit/uiaccessibilitycustomaction)
values.

This attribute is not included in the default page source due to performance reasons, but it
can be added by changing the [`includeCustomActionsInPageSource`](./settings.md) setting to `true`, or
retrieved using the [Get Element Attribute](https://www.w3.org/TR/webdriver2/#get-element-attribute)
API.

## bundleId

> Example: `com.apple.springboard`

Returns the bundle ID of the currently active application. Only available for the root
`XCUIElementTypeApplication` element.
