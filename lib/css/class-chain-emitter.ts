import type {
  ParsedAttribute,
  ParsedRule,
  ParsedSelector,
  StrategyEmitter,
} from '@appium/css-locator-to-native';
import {errors} from 'appium/driver';

import {escapeRegExp, isEmpty} from '../utils';

const BOOLEAN_ATTRS = new Set(['visible', 'accessible', 'accessibility-container', 'enabled']);

const STRING_ATTRS = new Set(['label', 'name', 'value', 'type']);

/** Converts parsed CSS selectors into class chain strings. */
export class ClassChainEmitter implements StrategyEmitter {
  readonly strategy: string;

  constructor(strategy: string) {
    this.strategy = strategy;
  }

  emit(parsed: ParsedSelector): string {
    return this.emitRule(parsed.rule);
  }

  private emitRule(rule: ParsedRule): string {
    if (rule.classes.length) {
      throw new errors.InvalidSelectorError(
        `'${rule.classes.join('.')}' is not a valid class. Must be a single string ` +
          `(e.g.: XCUIElementTypeWindow) without dots separating them`,
      );
    }

    let tagName = rule.tag ?? '';
    if (tagName && tagName !== '*' && !tagName.toLowerCase().startsWith('xcuielementtype')) {
      const capitalizedTagName = tagName.charAt(0).toUpperCase() + tagName.slice(1);
      tagName = `XCUIElementType${capitalizedTagName}`;
    }
    let classChainSelector = tagName || '*';

    const attrs: (string | {index: string} | undefined)[] = [];
    if (rule.id) {
      attrs.push(`name == "${rule.id}"`);
    }
    for (const attr of rule.attributes) {
      attrs.push(this.formatEntity(attr));
    }
    for (const pseudo of rule.pseudos) {
      attrs.push(this.formatEntity(pseudo));
    }

    const nonIndexAttrs = attrs.filter((attr) => typeof attr === 'string') as string[];
    if (!isEmpty(nonIndexAttrs)) {
      classChainSelector += `[\`${nonIndexAttrs.join(' AND ')}\`]`;
    }

    const indexAttr = attrs.find(
      (attr) =>
        typeof attr === 'object' && attr !== null && (attr as {index: string}).index !== undefined,
    ) as {index: string} | undefined;
    if (indexAttr) {
      classChainSelector += `[${indexAttr.index}]`;
    }

    if (rule.nested) {
      classChainSelector += `/${this.emitRule(rule.nested)}`;
    }

    return rule.combinator === 'child' ? classChainSelector : `**/${classChainSelector}`;
  }

  private formatEntity(attr: ParsedAttribute): string | {index: string} | undefined {
    if (attr.name === 'index') {
      return this.formatIndex(attr.value);
    }
    if (BOOLEAN_ATTRS.has(attr.name)) {
      return this.formatBooleanAttr(attr.name, attr.value);
    }
    if (STRING_ATTRS.has(attr.name)) {
      return this.formatStringAttr(attr);
    }
  }

  private formatIndex(value: string | undefined): {index: string} {
    return {index: value ?? ''};
  }

  private formatBooleanAttr(name: string, value: string | undefined): string {
    return `${this.toCamelCase(name)} == ${value ?? '1'}`;
  }

  private formatStringAttr(attr: ParsedAttribute): string {
    const attrName = this.toCamelCase(attr.name);
    const value = attr.value ?? '';
    if (value === '') {
      return `[${attrName} LIKE ${value}]`;
    }

    switch (attr.operator) {
      case '=':
        return `${attrName} == "${value}"`;
      case '*=':
        return `${attrName} MATCHES "${escapeRegExp(value)}"`;
      case '^=':
        return `${attrName} BEGINSWITH "${value}"`;
      case '$=':
        return `${attrName} ENDSWITH "${value}"`;
      case '~=':
        return `${attrName} CONTAINS "${value}"`;
      default:
        return `${attrName} == "${value}"`;
    }
  }

  private toCamelCase(str: string): string {
    const tokens = str
      .split('-')
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase());
    const out = tokens.join('');
    return out.charAt(0).toLowerCase() + out.slice(1);
  }
}
