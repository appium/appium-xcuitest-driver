import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import CssConverter from '../../lib/css-converter';

chai.should();
chai.use(chaiAsPromised);

describe('css-converter.js', function () {
  describe('simple cases', function () {
    const simpleCases = [
      ['XCUIElementTypeWindow:nth-child(2)', 'XCUIElementTypeWindow[2]'],
      ['XCUIElementTypeWindow *', 'XCUIElementTypeWindow/**/*'],
      ['XCUIElementTypeWindow > *', 'XCUIElementTypeWindow/*'],
      [
        'XCUIElementTypeWindow[label^=foo]:nth-child(-1)',
        'XCUIElementTypeWindow[`label BEGINSWITH "foo"`][-1]',
      ],
      [
        `XCUIElementTypeStaticText[name="foo"][value$='bar']`,
        'XCUIElementTypeStaticText[`name == "foo" AND value ENDSWITH "bar"`]',
      ],
      ['XCUIElementTypeOther[visible]', 'XCUIElementTypeOther[`visible == 1`]'],
      ['*:visible', '*[`visible == 1`]'],
      [
        'XCUIElementTypeWindow > XCUIElementTypeText',
        'XCUIElementTypeWindow/XCUIElementTypeText'
      ],
      [
        'XCUIElementTypeWindow XCUIElementTypeText',
        'XCUIElementTypeWindow/**/XCUIElementTypeText',
      ],
      ['XCUIElementTypeWindow#hello', 'XCUIElementTypeWindow[`name == "hello"`]'],
      ['#foobar', '*[`name == "foobar"`]'],
      ['XCUIElementTypeText#foo > #bar', 'XCUIElementTypeText[`name == "foo"`]/*[`name == "bar"`]'],
      [
        'window#foo[visible=true][value^=foo] > text#bar other:nth-child(3)',
        'XCUIElementTypeWindow[`name == "foo" AND visible == 1 AND value BEGINSWITH "foo"`]/XCUIElementTypeText[`name == "bar"`]/**/XCUIElementTypeOther[3]',
      ],
      ['window > *:nth-child(-1)', 'XCUIElementTypeWindow/*[-1]'],
    ];
    for (const [cssSelector, iosClassChainSelector] of simpleCases) {
      it(`should convert '${cssSelector}' to '${iosClassChainSelector}'`, function () {
        CssConverter.toIosClassChainSelector(cssSelector).should.equal(iosClassChainSelector);
      });
    }
  });
  describe('unsupported css', function () {
    const testCases = [
      ['*[visible="ItS ViSiBlE"]', /'visible' must be true, false or empty. Found 'ItS ViSiBlE'/],
      ['*[foo="bar"]', /'foo' is not a valid attribute. Supported attributes are */],
      ['*:visible("isvisible")', /'visible' must be true, false or empty. Found 'isvisible'/],
      [`This isn't valid[ css`, /Invalid CSS selector/],
      ['p ~ a', /'~' is not a supported combinator. /],
    ];
    for (const [cssSelector, error] of testCases) {
      it(`should reject '${cssSelector}' with '${error}'`, function () {
        (() => CssConverter.toIosClassChainSelector(cssSelector)).should.throw(error);
      });
    }
  });
});
