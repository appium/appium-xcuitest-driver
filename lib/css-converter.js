import { CssSelectorParser } from 'css-selector-parser';
import _ from 'lodash';
import { errors } from 'appium-base-driver';

const CssConverter = {};

const parser = new CssSelectorParser();
parser.registerSelectorPseudos('has');
parser.registerNestingOperators('>', '+', '~');
parser.registerAttrEqualityMods('^', '$', '*', '~');
parser.enableSubstitutes();

const BOOLEAN_ATTRS = [
  'visible', 'accessible', 'accessibility-container', 'enabled',
];

const NUMERIC_ATTRS = [
  'index'
];

const STR_ATTRS = [
  'label', 'name', 'value', 'type',
];

const ALL_ATTRS = [
  ...BOOLEAN_ATTRS,
  ...NUMERIC_ATTRS,
  ...STR_ATTRS,
];

const ATTRIBUTE_ALIASES = [
  ['name', ['id']],
  ['index', ['nth-child']],
];

/**
 * Convert hyphen separated word to camel case
 *
 * @param {string} str
 * @returns {string} The hyphen separated word translated to camel case
 */
function toCamelCase (str) {
  if (!str) {
    return '';
  }
  const tokens = str.split('-').map((str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase());
  const out = tokens.join('');
  return out.charAt(0).toLowerCase() + out.slice(1);
}

/**
 * @typedef {Object} CssNameValueObject
 * @property {?name} name The name of the CSS object
 * @property {?string} value The value of the CSS object
 */

/**
 * Get the boolean from a CSS object. If empty, return true. If not true/false/empty, throw exception
 *
 * @param {CssNameValueObject} css A CSS object that has 'name' and 'value'
 * @returns {string} Either 'true' or 'false'. If value is empty, return 'true'
 */
function requireBoolean (css) {
  const val = css.value?.toLowerCase() || 'true'; // an omitted boolean attribute means 'true' (e.g.: input[checked] means checked is true)
  switch (val) {
    case '0':
    case 'false':
      return '0';
    case '1':
    case 'true':
      return '1';
    default:
      throw new TypeError(`'${css.name}' must be true, false or empty. Found '${css.value}'`);
  }
}

/**
 * Get the canonical form of a CSS attribute name
 *
 * Converts to lowercase and if an attribute name is an alias for something else, return
 * what it is an alias for
 *
 * @param {Object} css CSS object
 * @returns {string} The canonical attribute name
 */
function requireAttributeName (css) {
  const attrName = css.name.toLowerCase();

  // Check if it's supported and if it is, return it
  if (ALL_ATTRS.includes(attrName)) {
    return attrName.toLowerCase();
  }

  // If attrName is an alias for something else, return that
  for (const [officialAttr, aliasAttrs] of ATTRIBUTE_ALIASES) {
    if (aliasAttrs.includes(attrName)) {
      return officialAttr;
    }
  }
  throw new Error(`'${attrName}' is not a valid attribute. ` +
    `Supported attributes are '${ALL_ATTRS.join(', ')}'`);
}

/**
 * @typedef {Object} CssAttr
 * @property {?string} valueType Type of attribute (must be string or empty)
 * @property {?string} value Value of the attribute
 * @property {?string} operator The operator between value and value type (=, *=, , ^=, $=)
 */

/**
 * Convert a CSS attribute into a UiSelector method call
 *
 * @param {CssAttr} cssAttr CSS attribute object
 * @returns {string} CSS attribute parsed as UiSelector
 */
function parseAttr (cssAttr) {
  if (cssAttr.valueType && cssAttr.valueType !== 'string') {
    throw new TypeError(`'${cssAttr.name}=${cssAttr.value}' is an invalid attribute. ` +
      `Only 'string' and empty attribute types are supported. Found '${cssAttr.valueType}'`);
  }
  const attrName = toCamelCase(requireAttributeName(cssAttr));

  // Validate that it's a supported attribute
  if (!STR_ATTRS.includes(attrName) && !BOOLEAN_ATTRS.includes(attrName)) {
    throw new Error(`'${attrName}' is not supported. Supported attributes are ` +
      `'${[...STR_ATTRS, ...BOOLEAN_ATTRS].join(', ')}'`);
  }

  // Parse index if it's an index attribute
  if (attrName === 'index') {
    return {index: cssAttr.value};
  }
  if (BOOLEAN_ATTRS.includes(attrName)) {
    return `${attrName} == ${requireBoolean(cssAttr)}`;
  }

  let value = cssAttr.value || '';
  if (value === '') {
    return `[${attrName} LIKE ${value}]`;
  }

  switch (cssAttr.operator) {
    case '=':
      return `${attrName} == "${value}"`;
    case '*=':
      return `${attrName} MATCHES "${_.escapeRegExp(value)}"`;
    case '^=':
      return `${attrName} BEGINSWITH "${value}"`;
    case '$=':
      return `${attrName} ENDSWITH "${value}"`;
    case '~=':
      return `${attrName} CONTAINS "${value}"`;
    default:
      // Unreachable, but adding error in case a new CSS attribute is added.
      throw new Error(`Unsupported CSS attribute operator '${cssAttr.operator}'. ` +
        ` '=', '*=', '^=', '$=' and '~=' are supported.`);
  }
}

/**
 * @typedef {Object} CssPseudo
 * @property {?string} valueType The type of CSS pseudo selector (https://www.npmjs.com/package/css-selector-parser for reference)
 * @property {?string} name The name of the pseudo selector
 * @property {?string} value The value of the pseudo selector
 */

/**
 * Convert a CSS pseudo class to a UiSelector
 *
 * @param {CssPseudo} cssPseudo CSS Pseudo class
 * @returns {string} Pseudo selector parsed as UiSelector
 */
function parsePseudo (cssPseudo) {
  if (cssPseudo.valueType && cssPseudo.valueType !== 'string') {
    throw new Error(`'${cssPseudo.name}=${cssPseudo.value}'. ` +
      `Unsupported css pseudo class value type: '${cssPseudo.valueType}'. Only 'string' type or empty is supported.`);
  }

  const pseudoName = requireAttributeName(cssPseudo);

  if (BOOLEAN_ATTRS.includes(pseudoName)) {
    return `${toCamelCase(pseudoName)} == ${requireBoolean(cssPseudo)}`;
  }

  if (pseudoName === 'index') {
    return {index: cssPseudo.value};
  }
}

/**
 * @typedef {Object} CssRule
 * @property {?string} nestingOperator The nesting operator (aka: combinator https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors)
 * @property {?string} tagName The tag name (aka: type selector https://developer.mozilla.org/en-US/docs/Web/CSS/Type_selectors)
 * @property {?string[]} classNames An array of CSS class names
 * @property {?CssAttr[]} attrs An array of CSS attributes
 * @property {?CssPseudo[]} attrs An array of CSS pseudos
 * @property {?string} id CSS identifier
 * @property {?CssRule} rule A descendant of this CSS rule
 */

/**
 * Convert a CSS rule to a UiSelector
 * @param {CssRule} cssRule CSS rule definition
 */
function parseCssRule (cssRule) {
  const { nestingOperator } = cssRule;
  if (nestingOperator && nestingOperator !== ' ' && nestingOperator !== '>') {
    throw new Error(`'${nestingOperator}' is not a supported combinator. ` +
      `Only child combinator (>) and descendant combinator are supported.`);
  }

  let iosClassChainSelector = '';
  if (cssRule.classNames) {
    throw new errors.InvalidSelectorError(`'${[cssRule || '', ...cssRule.classNames].join('.')}'
      is not a valid ios class. Must be a single string (e.g.: XCUIElementTypeWindow) without
      dots separating them`);
  }
  if (cssRule.tagName && cssRule.tagName !== '*' && !cssRule.tagName.toLowerCase().startsWith('xcuielementtype')) {
    const capitalizedTagName = cssRule.tagName.charAt(0).toUpperCase() + cssRule.tagName.slice(1);
    cssRule.tagName = `XCUIElementType${capitalizedTagName}`;
  }
  iosClassChainSelector += (cssRule.tagName || '*');

  let attrs = [];
  if (cssRule.id) {
    attrs.push(`name == "${cssRule.id}"`);
  }
  if (cssRule.attrs) {
    for (const attr of cssRule.attrs) {
      attrs.push(parseAttr(attr));
    }
  }
  if (cssRule.pseudos) {
    for (const pseudo of cssRule.pseudos) {
      attrs.push(parsePseudo(pseudo));
    }
  }
  const nonIndexAttrs = attrs.filter((attr) => _.isString(attr));
  if (nonIndexAttrs && nonIndexAttrs.length > 0) {
    iosClassChainSelector += `[\`${nonIndexAttrs.join(' AND ')}\`]`;
  }

  const indexAttr = attrs.find((attr) => _.isObject(attr) && attr.index);
  if (indexAttr) {
    iosClassChainSelector += `[${indexAttr.index}]`;
  }

  if (cssRule.rule) {
    iosClassChainSelector += `/${parseCssRule(cssRule.rule)}`;
  }

  if (cssRule.nestingOperator === '>') {
    return iosClassChainSelector;
  } else {
    return `**/` + iosClassChainSelector;
  }
}

/**
 * @typedef {Object} CssObject
 * @property {?string} type Type of CSS object. 'rule', 'ruleset' or 'selectors'
 */

/**
 * Convert CSS object to iOS Class Chain selector
 * @param {CssObject} css CSS object
 * @returns {string} The CSS object parsed as a UiSelector
 */
function parseCssObject (css) {
  switch (css.type) {
    case 'rule':
      return parseCssRule(css);
    case 'ruleSet':
      return parseCssObject(css.rule);
    case 'selectors':
      return css.selectors.map((selector) => parseCssObject(selector)).join('; ');

    default:
      // This is never reachable, but if it ever is do this.
      throw new Error(`iOS Class Chain does not support '${css.type}' css. Only supports 'rule', 'ruleSet', 'selectors'`);
  }
}

/**
 * Convert a CSS selector to a iOS Class Chain selector
 * @param {string} cssSelector CSS Selector
 * @returns {string} The CSS selector converted to an iOS Class Chain
 */
CssConverter.toIosClassChainSelector = function toIosClassChainSelector (cssSelector) {
  let cssObj;
  try {
    cssObj = parser.parse(cssSelector);
  } catch (e) {
    throw new errors.InvalidSelectorError(`Invalid CSS selector '${cssSelector}'. Reason: '${e.message}'`);
  }
  try {
    return parseCssObject(cssObj);
  } catch (e) {
    throw new errors.InvalidSelectorError(`Unsupported CSS selector '${cssSelector}'. Reason: '${e.message}'`);
  }
};

export default CssConverter;