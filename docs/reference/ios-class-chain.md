---
title: Class Chain Locator Strategy
---

The XCUITest driver supports searching elements using the _class chain_
[locator search strategy](./locator-strategies.md#class-chain) (`-ios class chain`). It is
powered by Apple XCTest, and is very similar to a simplified XPath, but is much faster, because
the lookup does not need the page source of the whole application. A class chain is a `/`-separated
list of _steps_. Each step selects elements of a certain type, optionally narrowed down by
predicates and a position, relative to the elements matched by the previous step.

!!! tip

    Use [predicate string](./ios-predicate.md) locators for elements that can be identified only by
    their own attributes. Class chain is the right choice when the element can be found only
    in relation to other elements, like its parent, descendants or siblings.

## Quick Examples

=== "Class Chain"

    ```java
    // java
    driver.findElements(AppiumBy.iOSClassChain(
        "**/XCUIElementTypeCell[`name BEGINSWITH 'A'`]/XCUIElementTypeButton[2]"));
    ```

=== "XPath"

    ```java
    // java
    driver.findElements(AppiumBy.xpath(
        "(//XCUIElementTypeCell[starts-with(@name, 'A')]/XCUIElementTypeButton)[2]"));
    ```

Both examples select the second button among the direct children of all cells whose name starts with `A`.

## Steps

Every step starts with an element type, which is one of the [`XCUIElementType*` names](./element-attributes.md),
or `*` for any type (same as `XCUIElementTypeAny`).

### Children and Descendants

Steps are separated by `/`, and select direct children of the elements matched by the previous step.
Use `**/` to select all descendants instead. The first step is relative to the element the search
is made from, which is the application if the search is made on the driver.

|Class chain|Selects|XPath alternative|
|---|---|---|
|`XCUIElementTypeWindow/XCUIElementTypeButton`|buttons, which are children of windows, which are children of the application|`/*/XCUIElementTypeWindow/XCUIElementTypeButton`|
|`**/XCUIElementTypeButton`|all buttons in the application|`//XCUIElementTypeButton`|
|`**/XCUIElementTypeCell/**/XCUIElementTypeButton`|all buttons inside of cells, at any depth|`//XCUIElementTypeCell//XCUIElementTypeButton`|

### Positions

A position in square brackets selects a single element among the matches of the step.
Positions start with `1`. A negative position counts from the end: `-1` is the last match.

|Class chain|Selects|XPath alternative|
|---|---|---|
|`**/XCUIElementTypeCell[3]`|the third cell|`(//XCUIElementTypeCell)[3]`|
|`**/XCUIElementTypeCell[-1]`|the last cell|`(//XCUIElementTypeCell)[last()]`|
|`XCUIElementTypeWindow[2]/*[-2]`|the second last child of the second window|`/*/XCUIElementTypeWindow[2]/*[last() - 1]`|

!!! warning

    A position selects among the matches of the _whole_ step, not per matched element of the previous
    step. XPath positions are evaluated for each parent separately, so wrap the path
    into parentheses to get the same behavior: `(//XCUIElementTypeCell/XCUIElementTypeButton)[2]`.
    Also, avoid positions in the intermediate steps if possible, because they make the lookup slower.

### Predicates

Predicates restrict the elements of a step. They are put into square brackets before the position,
and every predicate is a [predicate expression](./ios-predicate.md) using
the [element attributes](./element-attributes.md):

- ``[`predicate`]`` - the predicate is applied to the matched elements themselves
- `[$predicate$]` - the predicate is applied to all _descendants_ of the matched elements;
  an element is selected if at least one of its descendants satisfies the predicate

A backtick or dollar sign inside a predicate must be escaped by doubling it.
Several predicates are applied one after another, in the given order.

|Class chain|Selects|XPath alternative|
|---|---|---|
|``**/XCUIElementTypeButton[`name == 'OK'`]``|buttons named `OK`|`//XCUIElementTypeButton[@name='OK']`|
|``**/XCUIElementTypeCell[`visible == 1`][`name CONTAINS 'done'`]``|visible cells with `done` in the name|`//XCUIElementTypeCell[@visible='true' and contains(@name, 'done')]`|
|``**/XCUIElementTypeCell[$type == 'XCUIElementTypeImage' AND name == 'bla'$]``|cells, which contain an image named `bla`|`//XCUIElementTypeCell[.//XCUIElementTypeImage[@name='bla']]`|
|``**/XCUIElementTypeCell[`name BEGINSWITH 'A'`][-1]``|the last cell, whose name starts with `A`|`(//XCUIElementTypeCell[starts-with(@name, 'A')])[last()]`|

## Axis Steps

!!! info "Availability"

    Axis steps are available since XCUITest driver 13.6.0 (WebDriverAgent 17.1.0).
    Older versions fail such locators with an error.

Axis steps select elements relative to the elements matched by the previous step in a direction
other than "down". They replace the XPath axes, which are the most common reason to use the
much slower XPath strategy.

|Step|Selects|XPath alternative|
|---|---|---|
|`..`|the parent|`..` or `parent::*`|
|`^XCUIElementTypeCell`|all ancestors of the given type|`ancestor::XCUIElementTypeCell`|
|`>XCUIElementTypeButton`|all following siblings of the given type|`following-sibling::XCUIElementTypeButton`|
|`<XCUIElementTypeButton`|all preceding siblings of the given type|`preceding-sibling::XCUIElementTypeButton`|
|`~XCUIElementTypeButton`|all siblings of the given type, except the matched element itself|`preceding-sibling::XCUIElementTypeButton \| following-sibling::XCUIElementTypeButton`|

Axis steps accept `*`, predicates and positions, the same way as regular steps. `..` is the
exception: it has neither a type nor a position, but may have predicates.

### Examples

The button right before the "OK" button:

=== "Class Chain"

    ```java
    // java
    driver.findElement(AppiumBy.iOSClassChain(
        "**/XCUIElementTypeButton[`name == 'OK'`]/<XCUIElementTypeButton[1]"));
    ```

=== "XPath"

    ```java
    // java
    driver.findElement(AppiumBy.xpath(
        "//XCUIElementTypeButton[@name='OK']/preceding-sibling::XCUIElementTypeButton[1]"));
    ```

The first cell after the cell containing the "Total" label:

=== "Class Chain"

    ```java
    // java
    driver.findElement(AppiumBy.iOSClassChain(
        "**/XCUIElementTypeStaticText[`name == 'Total'`]/^XCUIElementTypeCell[1]/>XCUIElementTypeCell[1]"));
    ```

=== "XPath"

    ```java
    // java
    driver.findElement(AppiumBy.xpath(
        "//XCUIElementTypeStaticText[@name='Total']/ancestor::XCUIElementTypeCell[1]"
        + "/following-sibling::XCUIElementTypeCell[1]"));
    ```

All buttons next to the "OK" button, which are children of the same parent:

=== "Class Chain"

    ```java
    // java
    driver.findElements(AppiumBy.iOSClassChain(
        "**/XCUIElementTypeButton[`name == 'OK'`]/~XCUIElementTypeButton"));
    ```

=== "XPath"

    ```java
    // java
    driver.findElements(AppiumBy.xpath(
        "//XCUIElementTypeButton[@name='OK']/preceding-sibling::XCUIElementTypeButton"
        + " | //XCUIElementTypeButton[@name='OK']/following-sibling::XCUIElementTypeButton"));
    ```

The text field, which is next to the label "Email", found through the parent:

=== "Class Chain"

    ```java
    // java
    driver.findElement(AppiumBy.iOSClassChain(
        "**/XCUIElementTypeStaticText[`label == 'Email'`]/../XCUIElementTypeTextField"));
    ```

=== "XPath"

    ```java
    // java
    driver.findElement(AppiumBy.xpath(
        "//XCUIElementTypeStaticText[@label='Email']/../XCUIElementTypeTextField"));
    ```

The alert containing the "OK" button, using a predicate on the parent:

=== "Class Chain"

    ```java
    // java
    driver.findElements(AppiumBy.iOSClassChain(
        "**/XCUIElementTypeButton[`name == 'OK'`]/..[`type == 'XCUIElementTypeAlert'`]"));
    ```

=== "XPath"

    ```java
    // java
    driver.findElements(AppiumBy.xpath(
        "//XCUIElementTypeButton[@name='OK']/parent::XCUIElementTypeAlert"));
    ```

### Positions on Axes

Positions count along the axis, as they do for XPath axes: from the nearest element for `^`
and `<`, in document order for `>` and `~`, and from the other end if negative.

|Class chain|Selects|XPath alternative|
|---|---|---|
|`…/^XCUIElementTypeOther[1]`|the closest ancestor of the type|`ancestor::XCUIElementTypeOther[1]`|
|`…/^*[-1]`|the outermost ancestor, which is the application|`ancestor::*[last()]`|
|`…/<XCUIElementTypeButton[1]`|the closest preceding button|`preceding-sibling::XCUIElementTypeButton[1]`|
|`…/>XCUIElementTypeButton[-1]`|the last following button|`following-sibling::XCUIElementTypeButton[last()]`|

### Rules

- An axis step may follow any step, and may also start the chain, in which case it is relative
  to the element the search is made from, for example when finding an element within another element.
- An axis step cannot directly follow `**/`, but `**/` may follow an axis step:
  `XCUIElementTypeButton/../**/XCUIElementTypeImage`.
- As for the other steps, a position selects among the matches of the whole step. If the previous step
  matches several elements, then the following and all siblings of all of them are merged in the document order
  before the position is applied, while XPath applies the position for each element separately.
- The matches of a chain containing axis steps are always returned in the document order, same as for XPath.
- Axes are resolved on the accessibility tree snapshot, so such a lookup costs about the same as the
  part of the chain before the first axis step. In measurements on a simulator it was
  1.6-2.5x faster than the equivalent XPath.

## More Information

- [Locator Strategies](./locator-strategies.md) — overview of all strategies and their performance
- [Predicate Locator Strategy](./ios-predicate.md) — how to write the predicates used in class chains
- [Element Attributes](./element-attributes.md) — element types and attributes available in predicates
- [Class Chain Queries Construction Rules](https://github.com/facebookarchive/WebDriverAgent/wiki/Class-Chain-Queries-Construction-Rules) — the original rules
