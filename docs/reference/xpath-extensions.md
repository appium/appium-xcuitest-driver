---
title: XPath Extension Functions
---

Starting with [WebDriverAgent 13.2.0](https://github.com/appium/WebDriverAgent/releases/tag/v13.2.0)
([appium/WebDriverAgent#1144](https://github.com/appium/WebDriverAgent/pull/1144)), the XCUITest
driver's XPath locator strategy supports XPath 2–style **string extension functions** on top of the
existing XPath 1.0 evaluator. They are evaluated inside WebDriverAgent (libxml2) and work in both
standalone expressions and predicates inside element queries.

!!! info "XPath 1.0 baseline"

    The underlying engine is still XPath 1.0. Only the functions listed below are added; full XPath
    2.0 syntax is not supported. See [Locator Strategies](./locator-strategies.md#xpath) for general
    XPath usage notes and performance guidance.

!!! warning "WebDriverAgent version"

    These functions require WebDriverAgent **13.2.0 or newer**. The driver bundles WDA via the
    [`appium-webdriveragent`](https://www.npmjs.com/package/appium-webdriveragent) dependency. If you
    manage WDA yourself (prebuilt, preinstalled, or `appium:webDriverAgentUrl`), ensure the running
    WDA build includes this release.

## Quick examples

=== "Java"

    ```java
    // Case-insensitive label match
    driver.findElement(AppiumBy.xpath(
        "//XCUIElementTypeButton[matches(@label, '^alerts$', 'i')]"));

    // Case-normalized equality
    driver.findElement(AppiumBy.xpath(
        "//XCUIElementTypeButton[lower-case(@label) = 'alerts']"));
    ```

=== "JavaScript (WebdriverIO)"

    ```javascript
    await $('//XCUIElementTypeButton[ends-with(@label, "ing")]').click();
    ```

=== "Python"

    ```python
    driver.find_element(
        AppiumBy.XPATH,
        '//XCUIElementTypeButton[replace(@label, " ", "") = "Deadlockapp"]',
    )
    ```

## `matches`

Tests whether a string matches a regular expression.

**Signature:** `matches(input, pattern)` or `matches(input, pattern, flags)`

**Returns:** `boolean`

| Argument | Description |
| --- | --- |
| `input` | String to test (often an attribute, e.g. `@label`) |
| `pattern` | Regular expression ([`NSRegularExpression`](https://developer.apple.com/documentation/foundation/nsregularexpression)) |
| `flags` | Optional. Supported: `i` (case-insensitive), `m`, `s`, `x` |

```xpath
//XCUIElementTypeButton[matches(@label, '^Alerts$')]
//XCUIElementTypeButton[matches(@label, '^alerts$', 'i')]
```

## `ends-with`

Tests whether a string ends with a given suffix (literal suffix, not a regex).

**Signature:** `ends-with(input, suffix)`

**Returns:** `boolean`

```xpath
//XCUIElementTypeButton[ends-with(@label, 'ing')]
```

## `lower-case` / `upper-case`

Convert a string to lowercase or uppercase using the system locale rules.

**Signature:** `lower-case(input)` / `upper-case(input)`

**Returns:** `string`

```xpath
//XCUIElementTypeButton[lower-case(@label) = 'alerts']
//XCUIElementTypeButton[upper-case(@label) = 'TOUCH']
```

## `replace`

Replaces substrings that match a regular expression with a replacement template.

**Signature:** `replace(input, pattern, replacement)` or `replace(input, pattern, replacement, flags)`

**Returns:** `string`

| Argument | Description |
| --- | --- |
| `input` | Source string |
| `pattern` | Regular expression |
| `replacement` | Replacement template (same semantics as `NSRegularExpression` replacement) |
| `flags` | Optional. Supported: `i`, `m`, `s`, `x`, `q` |

```xpath
//XCUIElementTypeButton[replace(@label, ' ', '') = 'Deadlockapp']
replace(//XCUIElementTypeOther/@value, '-', '_')
```

## `tokenize` and `string-join`

Split a string into parts and join them with a separator. These are intended to be used together:
`tokenize` produces an internal token sequence that `string-join` consumes (this avoids temporary
XML node-sets in the XPath 1.0 engine).

**`tokenize` signature:** `tokenize(input)` or `tokenize(input, pattern)`

**`string-join` signature:** `string-join(sequence, separator)`

**Returns:** `string` (from `string-join`)

| `tokenize` form | Behavior |
| --- | --- |
| `tokenize(input)` | Split on whitespace (non-empty tokens) |
| `tokenize(input, '')` | Split into Unicode extended grapheme clusters |
| `tokenize(input, pattern)` | Split using the regex `pattern` as delimiter |

```xpath
string-join(tokenize(//XCUIElementTypeOther/@value, '-'), '|')
//XCUIElementTypeButton[string-join(tokenize(@label, ' '), '-') = 'Deadlock-app']
```

## Regular expression flags

| Flag | `matches` | `replace` | Meaning |
| --- | --- | --- | --- |
| `i` | yes | yes | Case-insensitive |
| `m` | yes | yes | Multiline (`^` / `$` match line boundaries) |
| `s` | yes | yes | Dot matches newlines |
| `x` | yes | yes | Ignore whitespace in the pattern |
| `q` | no | yes | Quote metacharacters (literal pattern) |

Invalid flag combinations cause the XPath expression to fail evaluation.

## Error handling

- **Invalid arity** (wrong number of arguments) fails the XPath evaluation.
- **Invalid regular expressions** or **invalid flags** fail the XPath evaluation.
- When used for element lookup, failures surface as an invalid XPath error from WebDriverAgent
  (`FBInvalidXPathException`).

Prefer [predicate string](./ios-predicate.md) or [class chain](./locator-strategies.md#class-chain)
locators when they can express the same condition; XPath remains the slowest strategy, even with
these helpers.

## More information

- [WebDriverAgent PR #1144](https://github.com/appium/WebDriverAgent/pull/1144) — implementation and tests
- [Locator Strategies](./locator-strategies.md) — strategy overview and performance notes
- [Element Attributes](./element-attributes.md) — attribute names available in XPath (`@label`, `@name`, etc.)
