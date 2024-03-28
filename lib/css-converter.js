import {createParser} from 'css-selector-parser';
import _ from 'lodash';
import {errors} from 'appium/driver';
import log from './logger.js';

const CssConverter = {};

const parseCssSelector = createParser({
  syntax: {
    pseudoClasses: {
      unknown: 'accept',
      definitions: {
        Selector: ['has'],
      },
    },
    combinators: ['>', '+', '~'],
    attributes: {
      operators: ['^=', '$=', '*=', '~=', '='],
    },
    ids: true,
    classNames: true,
    tag: {
      wildcard: true,
    },
  },
  substitutes: true,
});

const BOOLEAN_ATTRS = ['visible', 'accessible', 'accessibility-container', 'enabled'];

const NUMERIC_ATTRS = ['index'];

const STR_ATTRS = ['label', 'name', 'value', 'type'];

const ALL_ATTRS = [...BOOLEAN_ATTRS, ...NUMERIC_ATTRS, ...STR_ATTRS];

/**
 * @type {[string, string[]][]}
 */
const ATTRIBUTE_ALIASES = [
  ['name', ['id']],
  ['index', ['nth-child']],
];

/**
 * Convert hyphen separated word to camel case
 *
 * @param {string?} str
 * @returns {string} The hyphen separated word translated to camel case
 */
function toCamelCase(str) {
  if (!str) {
    return '';
  }
  const tokens = str
    .split('-')
    .map((str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase());
  const out = tokens.join('');
  return out.charAt(0).toLowerCase() + out.slice(1);
}

/**
 * Get the boolean from a CSS object. If empty, return true. If not true/false/empty, throw exception
 *
 * @param {import('css-selector-parser').AstAttribute|import('css-selector-parser').AstPseudoClass} cssAttr
 * @returns {string} Either 'true' or 'false'. If value is empty, return 'true'
 */
function requireBoolean(cssAttr) {
  // @ts-ignore We only support strings
  const attrValue = cssAttr.value?.value;
  const val = _.toLower(attrValue) || 'true'; // an omitted boolean attribute means 'true' (e.g.: input[checked] means checked is true)
  switch (val) {
    case '0':
    case 'false':
      return '0';
    case '1':
    case 'true':
      return '1';
    default:
      throw new TypeError(
        `'${cssAttr.name}' must be true/1 or false/0 or empty. Found '${attrValue}'`,
      );
  }
}

/**
 * Get the canonical form of a CSS attribute name
 *
 * Converts to lowercase and if an attribute name is an alias for something else, return
 * what it is an alias for
 *
 * @param {import('css-selector-parser').AstAttribute|import('css-selector-parser').AstPseudoClass} cssEntity
 * @returns {string} The canonical attribute name
 */
function requireEntityName(cssEntity) {
  const entityName = cssEntity.name.toLowerCase();

  // Check if it's supported and if it is, return it
  if (ALL_ATTRS.includes(entityName)) {
    return entityName.toLowerCase();
  }

  // If attrName is an alias for something else, return that
  for (const [officialAttr, aliasAttrs] of ATTRIBUTE_ALIASES) {
    if (aliasAttrs.includes(entityName)) {
      return officialAttr;
    }
  }
  throw new Error(
    `'${entityName}' is not a valid attribute. ` +
      `Supported attributes are: '${ALL_ATTRS.join(', ')}'`,
  );
}

/**
 * Convert a CSS attribute into a UiSelector method call
 *
 * @param {import('css-selector-parser').AstAttribute} cssAttr CSS attribute object
 * @returns {string|{index: string|undefined}} CSS attribute parsed as UiSelector
 */
function parseAttr(cssAttr) {
  // @ts-ignore We only care for strings
  const attrValue = cssAttr.value?.value;
  if (!_.isString(attrValue) && !_.isEmpty(attrValue)) {
    throw new TypeError(
      `'${cssAttr.name}=${attrValue}' is an invalid attribute. ` +
        `Only 'string' and empty attribute types are supported. Found '${attrValue}'`,
    );
  }
  const attrName = toCamelCase(requireEntityName(cssAttr));

  // Validate that it's a supported attribute
  if (!STR_ATTRS.includes(attrName) && !BOOLEAN_ATTRS.includes(attrName)) {
    throw new Error(
      `'${attrName}' is not supported. Supported attributes are ` +
        `'${[...STR_ATTRS, ...BOOLEAN_ATTRS].join(', ')}'`,
    );
  }

  // Parse index if it's an index attribute
  if (attrName === 'index') {
    return {index: attrValue};
  }
  if (BOOLEAN_ATTRS.includes(attrName)) {
    return `${attrName} == ${requireBoolean(cssAttr)}`;
  }

  let value = attrValue || '';
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
      throw new Error(
        `Unsupported CSS attribute operator '${cssAttr.operator}'. ` +
          ` '=', '*=', '^=', '$=' and '~=' are supported.`,
      );
  }
}

/**
 * Convert a CSS pseudo class to a UiSelector
 *
 * @param {import('css-selector-parser').AstPseudoClass} cssPseudo
 * @returns {string|{index: string|undefined}|undefined} Pseudo selector parsed as UiSelector
 */
function parsePseudo(cssPseudo) {
  // @ts-ignore We only care for strings
  const argValue = cssPseudo.argument?.value;
  if (!_.isString(argValue) && !_.isEmpty(argValue)) {
    throw new TypeError(
      `'${cssPseudo.name}=${argValue}'. ` +
        `Unsupported css pseudo class value: '${argValue}'. Only 'string' type or empty is supported.`,
    );
  }

  const pseudoName = requireEntityName(cssPseudo);

  if (BOOLEAN_ATTRS.includes(pseudoName)) {
    return `${toCamelCase(pseudoName)} == ${requireBoolean(cssPseudo)}`;
  }

  if (pseudoName === 'index') {
    return {index: argValue};
  }
}

/**
 * Convert a CSS rule to a UiSelector
 * @param {import('css-selector-parser').AstRule} cssRule CSS rule definition
 */
function parseCssRule(cssRule) {
  if (cssRule.combinator && ![' ', '>'].includes(cssRule.combinator)) {
    throw new Error(
      `'${cssRule.combinator}' is not a supported combinator. ` +
        `Only child combinator (>) and descendant combinator are supported.`,
    );
  }

  let iosClassChainSelector = '';
  const astClassNames = /** @type {import('css-selector-parser').AstClassName[]} */ (
    cssRule.items.filter(({type}) => type === 'ClassName')
  );
  const classNames = astClassNames.map(({name}) => name);
  if (classNames.length) {
    throw new errors.InvalidSelectorError(`'${[cssRule || '', ...classNames].join('.')}'
      is not a valid ios class. Must be a single string (e.g.: XCUIElementTypeWindow) without
      dots separating them`);
  }

  const astTag = /** @type {import('css-selector-parser').AstTagName|undefined} */ (
    cssRule.items.find(({type}) => type === 'TagName')
  );
  let tagName = astTag?.name ?? '';
  if (tagName && tagName !== '*' && !_.startsWith(_.toLower(tagName), 'xcuielementtype')) {
    const capitalizedTagName = tagName.charAt(0).toUpperCase() + tagName.slice(1);
    tagName = `XCUIElementType${capitalizedTagName}`;
  }
  iosClassChainSelector += tagName || '*';

  /** @type {(string|{index: string|undefined}|undefined)[]} */
  const attrs = [];

  const astIds = /** @type {import('css-selector-parser').AstId[]} */ (
    cssRule.items.filter(({type}) => type === 'Id')
  );
  const ids = astIds.map(({name}) => name);
  if (ids.length) {
    attrs.push(`name == "${ids[0]}"`);
  }
  const attributes = /** @type {import('css-selector-parser').AstAttribute[]} */ (
    cssRule.items.filter(({type}) => type === 'Attribute')
  );
  for (const attr of attributes) {
    attrs.push(parseAttr(attr));
  }
  const pseudoClasses = /** @type {import('css-selector-parser').AstPseudoClass[]} */ (
    cssRule.items.filter(({type}) => type === 'PseudoClass')
  );
  for (const pseudo of pseudoClasses) {
    attrs.push(parsePseudo(pseudo));
  }
  const nonIndexAttrs = attrs.filter((attr) => _.isString(attr));
  if (!_.isEmpty(nonIndexAttrs)) {
    iosClassChainSelector += `[\`${nonIndexAttrs.join(' AND ')}\`]`;
  }

  const indexAttr = attrs.find((attr) => _.isObject(attr) && attr.index);
  if (indexAttr) {
    iosClassChainSelector += `[${/** @type { {index: string} } */ (indexAttr).index}]`;
  }

  if (cssRule.nestedRule) {
    iosClassChainSelector += `/${parseCssRule(cssRule.nestedRule)}`;
  }

  return cssRule.combinator === '>' ? iosClassChainSelector : `**/${iosClassChainSelector}`;
}

/**
 * Convert CSS object to iOS Class Chain selector
 *
 * @param {import('css-selector-parser').AstSelector} css CSS object
 * @returns {string} The CSS object parsed as a UiSelector
 */
function parseCssObject(css) {
  if (!_.isEmpty(css.rules)) {
    return parseCssRule(css.rules[0]);
  }

  throw new Error('No rules could be parsed out of the current selector');
}

/**
 * Convert a CSS selector to a iOS Class Chain selector
 * @param {string} cssSelector CSS Selector
 * @returns {string} The CSS selector converted to an iOS Class Chain
 */
CssConverter.toIosClassChainSelector = function toIosClassChainSelector(cssSelector) {
  let cssObj;
  try {
    cssObj = parseCssSelector(cssSelector);
  } catch (e) {
    log.debug(e.stack);
    throw new errors.InvalidSelectorError(
      `Invalid CSS selector '${cssSelector}'. Reason: '${e.message}'`,
    );
  }
  try {
    return parseCssObject(cssObj);
  } catch (e) {
    log.debug(e.stack);
    throw new errors.InvalidSelectorError(
      `Unsupported CSS selector '${cssSelector}'. Reason: '${e.message}'`,
    );
  }
};

export default CssConverter;
