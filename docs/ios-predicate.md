---
title: iOS Predicates
---

*NOTE*: iOS predicates are usable via `-ios predicate string` and `-ios class chain` locator strategies

*NOTE*: It is worth looking at [NSPredicate Cheat Sheet](https://academy.realm.io/posts/nspredicate-cheatsheet/).

Native predicate search strategy (powered by Apple XCTest) provides much flexibility and is much faster than XPath. **[Predicates](https://developer.apple.com/library/content/documentation/Cocoa/Conceptual/Predicates/AdditionalChapters/Introduction.html)** can be used to restrict a set of elements to select only those for which some condition evaluates to true.

'-ios predicate string' example:

```java
// java
appiumDriver.findElements(AppiumBy.iOSNsPredicateString("isVisible == 1"));
```

'-ios class chain' example:

```java
// java
appiumDriver.findElements(AppiumBy.iOSClassChain("**/XCUIElementTypeWindow[`label LIKE '*yolo*'`]"));
```

The first example would select all visible elements on the page and the second one, - all elements of type `XCUIElementTypeWindow` whose label contains `yolo`. Class chain queries allow to create much more
complicated search expressions and may contain multiple predicates. Read [Class Chain Queries Construction Rules](https://github.com/facebookarchive/WebDriverAgent/wiki/Class-Chain-Queries-Construction-Rules) for more details on how to build such queries.

### Basic Comparisons

= , ==
- The left-hand expression is equal to the right-hand expression:
```java
// java
appiumDriver.findElements(AppiumBy.iOSNsPredicateString("label == 'Olivia'"));

// same in Xpath:
appiumDriver.findElements(AppiumBy.xpath("//*[@label = 'Olivia']"));
```

\>= , =\>
- The left-hand expression is greater than or equal to the right-hand expression.

<= , =<
- The left-hand expression is less than or equal to the right-hand expression.

\>
- The left-hand expression is greater than the right-hand expression.

<
- The left-hand expression is less than the right-hand expression.

!= , <\>
- The left-hand expression is not equal to the right-hand expression.

BETWEEN
- The left-hand expression is between, or equal to either of, the values specified in the right-hand side. The right-hand side is a two value array (an array is required to specify order) giving upper and lower bounds. For example, ```1 BETWEEN { 0 , 33 }```, or ```$INPUT BETWEEN { $LOWER, $UPPER }```.
In Objective-C, you could create a BETWEEN predicate as shown in the following example:

```java
appiumDriver.findElements(AppiumBy.iOSNsPredicateString("rect.x BETWEEN { 1, 100 }"));
```

This creates a predicate that matches all elements whole left top coordinate is in range between 1 and 100.

### Boolean Value Predicates

TRUEPREDICATE
- A predicate that always evaluates to ```TRUE``` .

FALSEPREDICATE
- A predicate that always evaluates to ```FALSE```.

### Basic Compound Predicates

AND , &&
- Logical AND.

OR , ||
- Logical OR.

NOT , !
- Logical NOT.

### String Comparisons

String comparisons are by default case and diacritic sensitive. You can modify an operator using the key characters ```c``` and ```d``` within square braces to specify case and diacritic insensitivity respectively, for example ```value BEGINSWITH[cd] 'bar'``

BEGINSWITH
- The left-hand expression begins with the right-hand expression.

```java
appiumDriver.findElement(AppiumBy.iOSNsPredicateString("type == 'XCUIElementTypeButton' AND name BEGINSWITH 'results toggle'"));

// same in Xpath:
appiumDriver.findElement(AppiumBy.xpath("//XCUIElementTypeButton[starts-with(@name, 'results toggle')]"));
```

CONTAINS
- The left-hand expression contains the right-hand expression.

```java
appiumDriver.findElement(AppiumBy.iOSNsPredicateString("type == 'XCUIElementCollectionView' AND name CONTAINS 'opera'"));

// same in Xpath:
appiumDriver.findElement(AppiumBy.xpath("//XCUIElementCollectionView[contains(@name, 'opera')]"));
```

ENDSWITH
- The left-hand expression ends with the right-hand expression.

LIKE
- The left hand expression equals the right-hand expression: ? and * are allowed as wildcard characters, where ? matches 1 character and * matches 0 or more characters. In Mac OS X v10.4, wildcard characters do not match newline characters.

```java
appiumDriver.findElement(AppiumBy.iOSNsPredicateString("name LIKE '*Total: $*'"));

// XPath1 does not have an alternative to the above expression
```

MATCHES
- The left hand expression equals the right hand expression using a regex -style comparison according to ICU v3 (for more details see the ICU User Guide for [Regular Expressions](http://userguide.icu-project.org/strings/regexp)).

```java
appiumDriver.findElement(AppiumBy.iOSNsPredicateString("value MATCHES '.*of [1-9]'"));

// XPath1 does not have an alternative to the above expression
```

### Aggregate Operations

IN
- Equivalent to an SQL IN operation, the left-hand side must appear in the collection specified by the right-hand side. For example, ```name IN { 'Ben', 'Melissa', 'Matthew' }``` . The collection may be an array, a set, or a dictionary—in the case of a dictionary, its values are used.

### Identifiers

**C style identifier**
- Any C style identifier that is not a reserved word.

**\#symbol**
- Used to escape a reserved word into a user identifier.

**[\\]{octaldigit}{3}**
- Used to escape an octal number ( ```\``` followed by 3 octal digits).

**[\\][xX]{hexdigit}{2}**
- Used to escape a hex number ( ```\x``` or ```\X``` followed by 2 hex digits).

**[\\][uU]{hexdigit}{4}**
- Used to escape a Unicode number ( ```\u``` or ```\U``` followed by 4 hex digits).

### Literals

Single and double quotes produce the same result, but they do not terminate each other. For example, ```"abc"``` and ```'abc'``` are identical, whereas ```"a'b'c"``` is equivalent to a space-separated concatenation of ```a, 'b', c```.

FALSE , NO
- Logical false.

TRUE , YES
- Logical true.

NULL , NIL
- A null value.

SELF
- Represents the object being evaluated.

"text"
- A character string.

'text'
- A character string.

**Comma-separated literal array**
- For example, ```{ 'comma', 'separated', 'literal', 'array' }``` .

**Standard integer and fixed-point notations**
- For example, ```1 , 27 , 2.71828 , 19.75``` .

**Floating-point notation with exponentiation**
- For example, ```9.2e-5``` .

0x
- Prefix used to denote a hexadecimal digit sequence.

0o
- Prefix used to denote an octal digit sequence.

0b
- Prefix used to denote a binary digit sequence.

### Reserved Words

The following words are reserved:

`AND, OR, IN, NOT, ALL, ANY, SOME, NONE, LIKE, CASEINSENSITIVE, CI, MATCHES, CONTAINS, BEGINSWITH, ENDSWITH, BETWEEN, NULL, NIL, SELF, TRUE, YES, FALSE, NO, FIRST, LAST, SIZE, ANYKEY, SUBQUERY, CAST, TRUEPREDICATE, FALSEPREDICATE`

### Available Attributes

Check the [Element Attributes](./element-attributes.md) document to know all element attribute
names and types that are available for usage in predicate locators.
