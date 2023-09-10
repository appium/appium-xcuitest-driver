import _ from 'lodash';
import CssConverter from '../css-converter';
import {errors} from 'appium/driver';
import {util} from 'appium/support';

// we override the xpath search for this first-visible-child selector, which
// looks like /*[@firstVisible="true"]
const MAGIC_FIRST_VIS_CHILD_SEL = /\/\*\[@firstVisible\s*=\s*('|")true\1\]/;

// we likewise override xpath search to provide a shortcut for finding all
// scrollable elements
const MAGIC_SCROLLABLE_SEL = /\/\/\*\[@scrollable\s*=\s*('|")true\1\]/;

const WDA_CLASS_CHAIN_STRATEGY = 'class chain';

export default {
  /**
   * @this {XCUITestDriver}
   */
  async findElOrEls(strategy, selector, mult, context) {
    if (this.isWebview()) {
      return await this.findWebElementOrElements(strategy, selector, mult, context);
    } else {
      return await this.findNativeElementOrElements(strategy, selector, mult, context);
    }
  },
  /**
   * @this {XCUITestDriver}
   * @privateRemarks I'm not sure what these objects are; they aren't `Element`.
   * @returns {Promise<any|any[]|undefined>}
   */
  async findNativeElementOrElements(strategy, selector, mult, context) {
    const initSelector = selector;
    let rewroteSelector = false;
    if (strategy === '-ios predicate string') {
      // WebDriverAgent uses 'predicate string'
      strategy = 'predicate string';
    } else if (strategy === '-ios class chain') {
      // WebDriverAgent uses 'class chain'
      strategy = WDA_CLASS_CHAIN_STRATEGY;
    } else if (strategy === 'css selector') {
      strategy = WDA_CLASS_CHAIN_STRATEGY;
      selector = CssConverter.toIosClassChainSelector(selector);
    }

    // Check if the word 'View' is appended to selector and if it is, strip it out
    function stripViewFromSelector(selector) {
      // Don't strip it out if it's one of these 4 element types
      // (see https://github.com/facebook/WebDriverAgent/blob/master/WebDriverAgentLib/Utilities/FBElementTypeTransformer.m for reference)
      const keepView = [
        'XCUIElementTypeScrollView',
        'XCUIElementTypeCollectionView',
        'XCUIElementTypeTextView',
        'XCUIElementTypeWebView',
      ].includes(selector);

      if (!keepView && selector.indexOf('View') === selector.length - 4) {
        return selector.substr(0, selector.length - 4);
      } else {
        return selector;
      }
    }

    if (strategy === 'class name') {
      // XCUITest classes have `XCUIElementType` prepended
      // first check if there is the old `UIA` prefix
      if (selector.startsWith('UIA')) {
        selector = selector.substring(3);
      }
      // now check if we need to add `XCUIElementType`
      if (!selector.startsWith('XCUIElementType')) {
        selector = stripViewFromSelector(`XCUIElementType${selector}`);
        rewroteSelector = true;
      }
    }

    if (strategy === 'xpath' && MAGIC_FIRST_VIS_CHILD_SEL.test(selector)) {
      return await this.getFirstVisibleChild(mult, context);
    } else if (strategy === 'xpath' && MAGIC_SCROLLABLE_SEL.test(selector)) {
      [strategy, selector] = rewriteMagicScrollable(mult, this.log);
    } else if (strategy === 'xpath') {
      // Replace UIA if it comes after a forward slash or is at the beginning of the string
      selector = selector.replace(/(^|\/)(UIA)([^[/]+)/g, (str, g1, g2, g3) => {
        rewroteSelector = true;
        return g1 + stripViewFromSelector(`XCUIElementType${g3}`);
      });
    }

    if (rewroteSelector) {
      this.log.info(
        `Rewrote incoming selector from '${initSelector}' to ` +
          `'${selector}' to match XCUI type. You should consider ` +
          `updating your tests to use the new selectors directly`,
      );
    }

    return await this.doNativeFind(strategy, selector, mult, context);
  },
  /**
   * @this {XCUITestDriver}
   */
  async doNativeFind(strategy, selector, mult, context) {
    context = util.unwrapElement(context);

    let endpoint = `/element${context ? `/${context}/element` : ''}${mult ? 's' : ''}`;

    let body = {
      using: strategy,
      value: selector,
    };

    /** @type {import('./proxy-helper').AllowedHttpMethod} */
    const method = 'POST';

    // This is either an array is mult === true
    // or an object if mult === false
    /** @type {Element[]|undefined} */
    let els;
    try {
      await this.implicitWaitForCondition(async () => {
        try {
          els = /** @type {Element[]|undefined} */ (
            await this.proxyCommand(endpoint, method, body)
          );
        } catch (err) {
          els = [];
        }
        // we succeed if we get some elements
        return !_.isEmpty(els);
      });
    } catch (err) {
      if (err.message && err.message.match(/Condition unmet/)) {
        // condition was not met setting res to empty array
        els = [];
      } else {
        throw err;
      }
    }
    if (mult) {
      return els;
    }
    if (_.isEmpty(els)) {
      throw new errors.NoSuchElementError();
    }
    return els;
  },
  /**
   * @this {XCUITestDriver}
   */
  async getFirstVisibleChild(mult, context) {
    this.log.info(`Getting first visible child`);
    if (mult) {
      throw new Error('Cannot get multiple first visible children!');
    }
    if (!context) {
      throw new Error('Cannot get first visible child without a context element');
    }
    let index = 1;
    // loop through children via class-chain finds, until we run out of children
    // or we find a visible one. This loop looks infinite but its not, because at
    // some point the call to doNativeFind will throw with an Element Not Found
    // error, when the index gets higher than the number of child elements. This
    // is what we want because that error will halt the loop and make it all the
    // way to the client.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const strategy = WDA_CLASS_CHAIN_STRATEGY;
      const selector = `*[${index}]`;
      const nthChild = await this.doNativeFind(strategy, selector, false, context);
      const visible = await this.getAttribute('visible', nthChild);
      if (visible === 'true') {
        this.log.info(`Found first visible child at position ${index}`);
        return nthChild;
      }
      index++;
    }
  },
};

/**
 *
 * @param {boolean} mult
 * @param {import('@appium/types').AppiumLogger|null} log
 * @returns {[string, string]}
 */
function rewriteMagicScrollable(mult, log = null) {
  const pred = ['ScrollView', 'Table', 'CollectionView', 'WebView']
    .map((t) => `type == "XCUIElementType${t}"`)
    .join(' OR ');
  const strategy = WDA_CLASS_CHAIN_STRATEGY;
  let selector = '**/*[`' + pred + '`]';
  if (!mult) {
    selector += '[1]';
  }
  log?.info(
    'Rewrote request for scrollable descendants to class chain ' +
      `format with selector '${selector}'`,
  );
  return [strategy, selector];
}

/**
 * @typedef {import('../driver').XCUITestDriver} XCUITestDriver
 * @typedef {import('@appium/types').Element} Element
 */
