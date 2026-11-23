---
title: Class Chain Locator Strategy
---

The XCUITest driver supports searching elements using the _class chain_
[locator search strategy](./locator-strategies.md#class-chain) (`-ios class chain`). It is
powered by Apple XCTest, and is very similar to a simplified XPath, but is much faster, because
the lookup does not need the page source of the whole application. It is a layer over the native
[XCUIElementQuery](https://developer.apple.com/documentation/xctest/xcuielementquery) lookup calls
with some additional features, like positions in the intermediate steps and negative positions
counted from the end. A class chain is a `/`-separated
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
    driver.findElement(AppiumBy.iOSClassChain(
        "**/XCUIElementTypeCell[`name BEGINSWITH 'A'`]/XCUIElementTypeButton[2]"));
    ```

=== "XPath"

    ```java
    // java
    driver.findElement(AppiumBy.xpath(
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

A position in square brackets selects a single element among the matches of the entire preceding
chain, not per matched element of the previous step, like for XPath. Positions start with `1`.
A negative position counts from the end: `-1` is the last match. Avoid positions in the
intermediate steps if possible, because they make the lookup slower.

|Class chain|Selects|XPath alternative|
|---|---|---|
|`**/XCUIElementTypeCell[3]`|the third cell|`(//XCUIElementTypeCell)[3]`|
|`**/XCUIElementTypeCell[-1]`|the last cell|`(//XCUIElementTypeCell)[last()]`|
|`**/XCUIElementTypeCell/XCUIElementTypeButton[2]`|the second button among the children of all cells|`(//XCUIElementTypeCell/XCUIElementTypeButton)[2]`|
|`XCUIElementTypeWindow[2]/*[-2]`|the second last child of the second window|`/*/XCUIElementTypeWindow[2]/*[last() - 1]`|

### Predicates

Predicates restrict the elements of a step. They are put into square brackets before the position,
and every predicate is a [predicate expression](./ios-predicate.md) using
the [element attributes](./element-attributes.md):

- ``[`predicate`]`` - the predicate is applied to the matched elements themselves. It is the direct
  alternative of the native [matchingPredicate:](https://developer.apple.com/documentation/xctest/xcuielementquery/1500471-matchingpredicate?language=objc) selector
- `[$predicate$]` - the predicate is applied to all _descendants_ of the matched elements;
  an element is selected if at least one of its descendants satisfies the predicate. It is the direct
  alternative of the native [containingPredicate:](https://developer.apple.com/documentation/xctest/xcuielementquery/1500956-containingpredicate?language=objc) selector

Only the marker enclosing the predicate has to be escaped inside of it by doubling: a backtick
in ``[`...`]`` or a dollar sign in `[$...$]`, for example `[$name == 'a$$b'$]`.
Predicates are always put before the position, never after it. Several predicates are applied
one after another, in the given order.

|Class chain|Selects|XPath alternative|
|---|---|---|
|``**/XCUIElementTypeButton[`name == 'OK'`]``|buttons named `OK`|`//XCUIElementTypeButton[@name='OK']`|
|``**/XCUIElementTypeCell[`visible == 1 AND name CONTAINS 'done'`]``|visible cells with `done` in the name|`//XCUIElementTypeCell[@visible='true' and contains(@name, 'done')]`|
|``**/XCUIElementTypeCell[$type == 'XCUIElementTypeImage' AND name == 'bla'$]``|cells, which contain an image named `bla`|`//XCUIElementTypeCell[.//XCUIElementTypeImage[@name='bla']]`|
|``**/XCUIElementTypeCell[`name BEGINSWITH 'A'`][-1]``|the last cell, whose name starts with `A`|`(//XCUIElementTypeCell[starts-with(@name, 'A')])[last()]`|

## Axis Steps

!!! info "Availability"

    Axis steps are available since XCUITest driver 13.7.0 (WebDriverAgent 17.1.0).
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
|`~XCUIElementTypeButton`|all siblings of the given type, except the matched element itself|`preceding-sibling::XCUIElementTypeButton | following-sibling::XCUIElementTypeButton`|

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
    driver.findElement(AppiumBy.iOSClassChain(
        "**/XCUIElementTypeButton[`name == 'OK'`]/..[`type == 'XCUIElementTypeAlert'`]"));
    ```

=== "XPath"

    ```java
    // java
    driver.findElement(AppiumBy.xpath(
        "//XCUIElementTypeButton[@name='OK']/parent::XCUIElementTypeAlert"));
    ```

### Positions on Axes

Positions count along the axis, as they do for XPath axes: from the nearest element for `^`
and `<`, in document order for `>` and `~`, and from the other end if negative.

|Class chain|Selects|XPath alternative|
|---|---|---|
|`^XCUIElementTypeOther[1]`|the closest ancestor of the type|`ancestor::XCUIElementTypeOther[1]`|
|`^*[-1]`|the outermost ancestor, which is the application|`ancestor::*[last()]`|
|`<XCUIElementTypeButton[1]`|the closest preceding button|`preceding-sibling::XCUIElementTypeButton[1]`|
|`>XCUIElementTypeButton[-1]`|the last following button|`following-sibling::XCUIElementTypeButton[last()]`|

### Rules

- An axis step may follow any step, and may also start the chain, in which case it is relative
  to the element the search is made from, for example when finding an element within another element.
- An axis step cannot directly follow `**/`, but `**/` may follow an axis step:
  `XCUIElementTypeButton/../**/XCUIElementTypeImage`.
- As for the other steps, a position selects among the matches of the whole step. If the previous step
  matches several elements, then the matches of `>` and `~` for all of them are merged in the document order
  before the position is applied, while the matches of `^` and `<` stay in the order of the axis, with
  duplicates removed. XPath applies the position for each element separately.
- The matches of a chain containing axis steps are always returned in the document order, same as for XPath.
- Axes are resolved on the accessibility tree snapshot, so such a lookup costs about the same as the
  part of the chain before the first axis step. In measurements on a simulator it was
  1.6-2.5x faster than the equivalent XPath.

## More Examples

The examples below are relative to the application. Each of them is shown together with
the equivalent XPath locator.

### Direct Children

|Class chain|Selects|XPath alternative|
|---|---|---|
|`XCUIElementTypeWindow`|all windows|`/*/XCUIElementTypeWindow`|
|`XCUIElementTypeWindow[2]`|the second window|`/*/XCUIElementTypeWindow[2]`|
|`XCUIElementTypeWindow/XCUIElementTypeButton[3]`|the third button among the children of all windows|`(/*/XCUIElementTypeWindow/XCUIElementTypeButton)[3]`|
|`XCUIElementTypeWindow[2]/*`|all children of the second window|`/*/XCUIElementTypeWindow[2]/*`|
|`XCUIElementTypeWindow[2]/*[3]`|the third child of the second window|`/*/XCUIElementTypeWindow[2]/*[3]`|
|`XCUIElementTypeWindow[2]/*[-2]`|the second last child of the second window|`/*/XCUIElementTypeWindow[2]/*[last() - 1]`|
|``XCUIElementTypeWindow[`name CONTAINS[cd] 'blabla'`]``|windows, whose name contains `blabla` ignoring case and diacritics|`/*/XCUIElementTypeWindow[contains(lower-case(@name), 'blabla')]` (diacritics are not ignored)|
|``XCUIElementTypeWindow[`label BEGINSWITH 'blabla'`][-1]``|the last window, whose label starts with `blabla`|`(/*/XCUIElementTypeWindow[starts-with(@label, 'blabla')])[last()]`|
|``XCUIElementTypeWindow/*[`value == 'bla1' OR label == 'bla2'`]``|children of windows, whose value is `bla1` or label is `bla2`|`/*/XCUIElementTypeWindow/*[@value='bla1' or @label='bla2']`|
|``XCUIElementTypeWindow[`name == "you're the winner"`]/*[`visible == 1`]``|visible children of the window named `you're the winner`|`/*/XCUIElementTypeWindow[@name="you're the winner"]/*[@visible='true']`|
|``XCUIElementTypeWindow/XCUIElementTypeTable/XCUIElementTypeCell[`visible == 1`][$type == 'XCUIElementTypeImage' AND name == 'bla'$]/XCUIElementTypeTextField``|text fields, which are direct children of visible table cells having at least one descendant image named `bla`|`/*/XCUIElementTypeWindow/XCUIElementTypeTable/XCUIElementTypeCell[@visible='true' and .//XCUIElementTypeImage[@name='bla']]/XCUIElementTypeTextField`|

### Descendants

|Class chain|Selects|XPath alternative|
|---|---|---|
|``**/XCUIElementTypeCell[`name BEGINSWITH 'B'`]``|all cells in the tree, whose name starts with `B`|`//XCUIElementTypeCell[starts-with(@name, 'B')]`|
|``**/XCUIElementTypeCell[`name BEGINSWITH 'A'`][-1]/XCUIElementTypeButton[10]``|the tenth button child of the very last cell in the tree, whose name starts with `A`|`(//XCUIElementTypeCell[starts-with(@name, 'A')])[last()]/XCUIElementTypeButton[10]`|
|``**/XCUIElementTypeCell[`name BEGINSWITH 'C'`][1]/XCUIElementTypeButton[10]``|the tenth button child of the first cell in the tree, whose name starts with `C`|`(//XCUIElementTypeCell[starts-with(@name, 'C')])[1]/XCUIElementTypeButton[10]`|
|``**/XCUIElementTypeCell[`name BEGINSWITH 'C'`]/XCUIElementTypeButton[10]``|the tenth button among the children of _all_ cells in the tree, whose name starts with `C`|`(//XCUIElementTypeCell[starts-with(@name, 'C')]/XCUIElementTypeButton)[10]`|
|``**/XCUIElementTypeCell[`name BEGINSWITH 'D'`]/**/XCUIElementTypeButton``|all buttons nested at any depth into cells, whose name starts with `D`|`//XCUIElementTypeCell[starts-with(@name, 'D')]//XCUIElementTypeButton`|

## More Information

- [Locator Strategies](./locator-strategies.md) — overview of all strategies and their performance
- [Predicate Locator Strategy](./ios-predicate.md) — how to write the predicates used in class chains
- [Element Attributes](./element-attributes.md) — element types and attributes available in predicates
