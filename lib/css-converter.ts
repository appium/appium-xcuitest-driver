import {createParser} from 'css-selector-parser';
import _ from 'lodash';
import {errors} from 'appium/driver';
import {log} from './logger';
import type {
  AstAttribute,
  AstPseudoClass,
  AstRule,
  AstSelector,
  AstClassName,
  AstTagName,
  AstId,
} from 'css-selector-parser';

export const CssConverter = {
  toIosClassChainSelector(cssSelector: string): string {
    let cssObj: AstSelector;
    try {
      cssObj = parseCssSelector(cssSelector);
    } catch (e: any) {
      log.debug(e.stack);
      throw new errors.InvalidSelectorError(
        `Invalid CSS selector '${cssSelector}'. Reason: '${e.message}'`,
      );
    }
    try {
      return parseCssObject(cssObj);
    } catch (e: any) {
      log.debug(e.stack);
      throw new errors.InvalidSelectorError(
        `Unsupported CSS selector '${cssSelector}'. Reason: '${e.message}'`,
      );
    }
  },
};

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

const BOOLEAN_ATTRS = ['visible', 'accessible', 'accessibility-container', 'enabled'] as const;

const NUMERIC_ATTRS = ['index'] as const;

const STR_ATTRS = ['label', 'name', 'value', 'type'] as const;

const ALL_ATTRS = [...BOOLEAN_ATTRS, ...NUMERIC_ATTRS, ...STR_ATTRS];

const ATTRIBUTE_ALIASES: [string, string[]][] = [
  ['name', ['id']],
  ['index', ['nth-child']],
];

/**
 * Convert hyphen separated word to camel case
 *
 * @param str
 * @returns The hyphen separated word translated to camel case
 */
function toCamelCase(str: string | null | undefined): string {
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
 * @param cssAttr
 * @returns Either 'true' or 'false'. If value is empty, return 'true'
 */
function requireBoolean(cssAttr: AstAttribute | AstPseudoClass): string {
  const attrValue = (cssAttr as any).value?.value;
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
 * @param cssEntity
 * @returns The canonical attribute name
 */
function requireEntityName(cssEntity: AstAttribute | AstPseudoClass): string {
  const entityName = cssEntity.name.toLowerCase();

  // Check if it's supported and if it is, return it
  if (ALL_ATTRS.includes(entityName as any)) {
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
 * @param cssAttr CSS attribute object
 * @returns CSS attribute parsed as UiSelector
 */
function parseAttr(cssAttr: AstAttribute): string | {index: string | undefined} {
  const attrValue = (cssAttr as any).value?.value;
  if (!_.isString(attrValue) && !_.isEmpty(attrValue)) {
    throw new TypeError(
      `'${cssAttr.name}=${attrValue}' is an invalid attribute. ` +
        `Only 'string' and empty attribute types are supported. Found '${attrValue}'`,
    );
  }
  const attrName = toCamelCase(requireEntityName(cssAttr));

  // Validate that it's a supported attribute
  if (!STR_ATTRS.includes(attrName as any) && !BOOLEAN_ATTRS.includes(attrName as any)) {
    throw new Error(
      `'${attrName}' is not supported. Supported attributes are ` +
        `'${[...STR_ATTRS, ...BOOLEAN_ATTRS].join(', ')}'`,
    );
  }

  // Parse index if it's an index attribute
  if (attrName === 'index') {
    return {index: attrValue};
  }
  if (BOOLEAN_ATTRS.includes(attrName as any)) {
    return `${attrName} == ${requireBoolean(cssAttr)}`;
  }

  const value = attrValue || '';
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
 * @param cssPseudo
 * @returns Pseudo selector parsed as UiSelector
 */
function parsePseudo(cssPseudo: AstPseudoClass): string | {index: string | undefined} | undefined {
  const argValue = (cssPseudo as any).argument?.value;
  if (!_.isString(argValue) && !_.isEmpty(argValue)) {
    throw new TypeError(
      `'${cssPseudo.name}=${argValue}'. ` +
        `Unsupported css pseudo class value: '${argValue}'. Only 'string' type or empty is supported.`,
    );
  }

  const pseudoName = requireEntityName(cssPseudo);

  if (BOOLEAN_ATTRS.includes(pseudoName as any)) {
    return `${toCamelCase(pseudoName)} == ${requireBoolean(cssPseudo)}`;
  }

  if (pseudoName === 'index') {
    return {index: argValue};
  }
}

/**
 * Convert a CSS rule to a UiSelector
 * @param cssRule CSS rule definition
 */
function parseCssRule(cssRule: AstRule): string {
  if (cssRule.combinator && ![' ', '>'].includes(cssRule.combinator)) {
    throw new Error(
      `'${cssRule.combinator}' is not a supported combinator. ` +
        `Only child combinator (>) and descendant combinator are supported.`,
    );
  }

  let iosClassChainSelector = '';
  const astClassNames = cssRule.items.filter(({type}) => type === 'ClassName') as AstClassName[];
  const classNames = astClassNames.map(({name}) => name);
  if (classNames.length) {
    throw new errors.InvalidSelectorError(`'${[cssRule || '', ...classNames].join('.')}'
      is not a valid ios class. Must be a single string (e.g.: XCUIElementTypeWindow) without
      dots separating them`);
  }

  const astTag = cssRule.items.find(({type}) => type === 'TagName') as AstTagName | undefined;
  let tagName = astTag?.name ?? '';
  if (tagName && tagName !== '*' && !_.startsWith(_.toLower(tagName), 'xcuielementtype')) {
    const capitalizedTagName = tagName.charAt(0).toUpperCase() + tagName.slice(1);
    tagName = `XCUIElementType${capitalizedTagName}`;
  }
  iosClassChainSelector += tagName || '*';

  const attrs: (string | {index: string | undefined} | undefined)[] = [];

  const astIds = cssRule.items.filter(({type}) => type === 'Id') as AstId[];
  const ids = astIds.map(({name}) => name);
  if (ids.length) {
    attrs.push(`name == "${ids[0]}"`);
  }
  const attributes = cssRule.items.filter(({type}) => type === 'Attribute') as AstAttribute[];
  for (const attr of attributes) {
    attrs.push(parseAttr(attr));
  }
  const pseudoClasses = cssRule.items.filter(({type}) => type === 'PseudoClass') as AstPseudoClass[];
  for (const pseudo of pseudoClasses) {
    attrs.push(parsePseudo(pseudo));
  }
  const nonIndexAttrs = attrs.filter((attr) => _.isString(attr)) as string[];
  if (!_.isEmpty(nonIndexAttrs)) {
    iosClassChainSelector += `[\`${nonIndexAttrs.join(' AND ')}\`]`;
  }

  const indexAttr = attrs.find(
    (attr) => _.isObject(attr) && (attr as {index: string}).index
  ) as {index: string} | undefined;
  if (indexAttr) {
    iosClassChainSelector += `[${indexAttr.index}]`;
  }

  if (cssRule.nestedRule) {
    iosClassChainSelector += `/${parseCssRule(cssRule.nestedRule)}`;
  }

  return cssRule.combinator === '>' ? iosClassChainSelector : `**/${iosClassChainSelector}`;
}

/**
 * Convert CSS object to iOS Class Chain selector
 *
 * @param css CSS object
 * @returns The CSS object parsed as a UiSelector
 */
function parseCssObject(css: AstSelector): string {
  if (!_.isEmpty(css.rules)) {
    return parseCssRule(css.rules[0]);
  }

  throw new Error('No rules could be parsed out of the current selector');
}
