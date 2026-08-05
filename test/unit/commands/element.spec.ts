import assert from 'node:assert/strict';
import {describe, it, before, afterEach, beforeEach} from 'node:test';

// eslint-disable-next-line
import sinon, {createSandbox} from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('element commands', function () {
  let sandbox: sinon.SinonSandbox;
  let driver: XCUITestDriver;
  let proxyStub: sinon.SinonStub;

  before(async function () {
    driver = new XCUITestDriver({} as any);
  });

  beforeEach(function () {
    sandbox = createSandbox();
    proxyStub = sandbox.stub(driver, 'proxyCommand');
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('setValueImmediate', function () {
    beforeEach(function () {
      sandbox.stub(driver, 'setValue');
    });

    it('should call setValue', async function () {
      await driver.setValueImmediate('hello', '2');
      assert.strictEqual((driver.setValue as any).calledOnceWithExactly('hello', '2'), true);
      assert.strictEqual((driver.setValue as any).returned(undefined), true);
    });
  });

  describe('getAttribute', function () {
    const elementId = 2;
    const attribute = 'enabled';

    afterEach(function () {
      assert.strictEqual(proxyStub.calledOnce, true);
    });

    it('should properly parse boolean true attribute presented as integer', async function () {
      proxyStub.resolves(1);
      assert.strictEqual(await driver.getAttribute(attribute, elementId as any), 'true');
    });

    it('should properly parse boolean false attribute presented as integer', async function () {
      proxyStub.resolves(0);
      assert.strictEqual(await driver.getAttribute(attribute, elementId as any), 'false');
    });

    it('should properly parse integer attribute presented as string', async function () {
      proxyStub.resolves('0');
      assert.strictEqual(await driver.getAttribute(attribute, elementId as any), '0');
    });

    it('should properly parse boolean attribute presented as bool', async function () {
      proxyStub.resolves(false);
      assert.strictEqual(await driver.getAttribute(attribute, elementId as any), 'false');
    });

    it('should properly parse null attribute', async function () {
      proxyStub.resolves(null);
      assert.strictEqual(await driver.getAttribute(attribute, elementId as any), null);
    });

    it('should properly parse string attribute', async function () {
      proxyStub.resolves('value');
      assert.strictEqual(await driver.getAttribute(attribute, elementId as any), 'value');
    });
  });

  describe('getProperty', function () {
    const elementId = 2;
    const property = 'enabled';

    afterEach(function () {
      assert.strictEqual(proxyStub.calledOnce, true);
    });

    it('should properly parse boolean true attribute presented as integer', async function () {
      proxyStub.resolves(1);
      assert.strictEqual(await driver.getProperty(property, elementId as any), 'true');
    });

    it('should properly parse boolean false attribute presented as integer', async function () {
      proxyStub.resolves(0);
      assert.strictEqual(await driver.getProperty(property, elementId as any), 'false');
    });

    it('should properly parse integer attribute presented as string', async function () {
      proxyStub.resolves('0');
      assert.strictEqual(await driver.getProperty(property, elementId as any), '0');
    });

    it('should properly parse boolean attribute presented as bool', async function () {
      proxyStub.resolves(false);
      assert.strictEqual(await driver.getProperty(property, elementId as any), 'false');
    });

    it('should properly parse null attribute', async function () {
      proxyStub.resolves(null);
      assert.strictEqual(await driver.getProperty(property, elementId as any), null);
    });

    it('should properly parse string attribute', async function () {
      proxyStub.resolves('value');
      assert.strictEqual(await driver.getProperty(property, elementId as any), 'value');
    });
  });

  describe('getAttribute - special contentSize', function () {
    it('should call the internal method instead of WDA', async function () {
      const getContentSizeStub = sandbox.stub(driver, 'getContentSize');
      getContentSizeStub.resolves('foo');
      assert.strictEqual(await driver.getAttribute('contentSize', 2 as any), 'foo');
      assert.strictEqual(proxyStub.called, false);
      assert.strictEqual(getContentSizeStub.calledOnce, true);
    });
  });

  describe('getContentSize', function () {
    const el = {ELEMENT: '1234'};
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getAttribute']>} */
    let getAttrStub: sinon.SinonStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getElementRect']>} */
    let getRectStub: sinon.SinonStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['findElOrEls']>} */
    let findElStub: sinon.SinonStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getSize']>} */
    let getSizeStub: sinon.SinonStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getLocationInView']>} */
    let getLocationStub: sinon.SinonStub;

    beforeEach(function () {
      getAttrStub = sandbox.stub(driver, 'getAttribute');
      getRectStub = sandbox.stub(driver, 'getElementRect');
      findElStub = sandbox.stub(driver, 'findElOrEls');
      getSizeStub = sandbox.stub(driver, 'getSize');
      getLocationStub = sandbox.stub(driver, 'getLocationInView');
    });

    describe('web context', function () {
      let oldContext: string;

      beforeEach(function () {
        oldContext = driver.curContext as string;
        driver.curContext = 'WEBVIEW';
      });
      afterEach(function () {
        driver.curContext = oldContext;
      });
      it('should throw when in a web context', async function () {
        await assert.rejects(driver.getContentSize(el as any), /not yet implemented/);
      });
    });

    it('should throw if trying to get contentSize of something other than table or collection', async function () {
      getAttrStub.resolves('XCUIElementTypeStatusBar');
      await assert.rejects(driver.getContentSize(el as any), /Can't get content size for type/);
    });

    it('should simply get the rect if just one child', async function () {
      getAttrStub.resolves('XCUIElementTypeTable');
      findElStub.resolves([{ELEMENT: 'foo'}]);
      getRectStub.resolves({x: 0, y: 0, height: 100, width: 200});
      getSizeStub.resolves({height: 100, width: 200});
      getLocationStub.resolves({x: 0, y: 0});
      const contentSizeObj = JSON.parse(await driver.getContentSize(el as any));
      assert.deepStrictEqual(contentSizeObj, {
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset: 100,
      });
      assert.strictEqual(getRectStub.calledOnce, true);
    });

    it('should get simple difference in element positions of a table', async function () {
      const el1 = {ELEMENT: 1};
      const el2 = {ELEMENT: 2};
      getAttrStub.resolves('XCUIElementTypeTable');
      findElStub.resolves([el1, el2]);
      getRectStub.withArgs(el1).resolves({x: 0, y: 10, width: 50, height: 60});
      getRectStub.withArgs(el2).resolves({x: 10, y: 80, width: 60, height: 100});
      getSizeStub.resolves({height: 100, width: 200});
      getLocationStub.resolves({x: 0, y: 0});
      const contentSizeObj = JSON.parse(await driver.getContentSize(el as any));
      assert.deepStrictEqual(contentSizeObj, {
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset: 170,
      });
      assert.strictEqual(getRectStub.calledTwice, true);
    });

    it('should be sensitive to row items in the case of a collection view', async function () {
      // set up a collection view with 3 rows of 2 elements.
      // give the last row just one element
      const fixtures = [
        {id: 1, x: 0, y: 0, height: 50, width: 50},
        {id: 2, x: 50, y: 0, height: 50, width: 50},
        {id: 3, x: 0, y: 60, height: 50, width: 50},
        {id: 4, x: 50, y: 60, height: 50, width: 50},
        {id: 5, x: 0, y: 120, height: 50, width: 50},
      ];
      const scrollableOffset = 170; // 3 rows plus space between two
      getAttrStub.resolves('XCUIElementTypeCollectionView');
      findElStub.resolves(fixtures.map((el) => ({ELEMENT: el.id})));
      for (const item of fixtures) {
        getRectStub.withArgs({ELEMENT: item.id}).resolves(item);
      }
      getSizeStub.resolves({height: 100, width: 200});
      getLocationStub.resolves({x: 0, y: 0});
      const contentSizeObj = JSON.parse(await driver.getContentSize(el as any));
      assert.deepStrictEqual(contentSizeObj, {
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset,
      });
      assert.strictEqual(getRectStub.calledThrice, true);
    });
  });

  describe('setValue', function () {
    describe('Native contest', function () {
      const elementId = 2;
      const expectedEndpoint = `/element/${elementId}/value`;
      const expectedMethod = 'POST';

      describe('success', function () {
        it('should proxy string as array of characters', async function () {
          await driver.setValue('hello\uE006', elementId as any);
          assert.strictEqual(
            proxyStub.calledOnceWithExactly(expectedEndpoint, expectedMethod, {
              value: ['h', 'e', 'l', 'l', 'o', '\n'],
            }),
            true,
          );
        });
        it('should proxy string with smileys as array of characters', async function () {
          await driver.setValue('hello😀😎', elementId as any);
          assert.strictEqual(
            proxyStub.calledOnceWithExactly(expectedEndpoint, expectedMethod, {
              value: ['h', 'e', 'l', 'l', 'o', '😀', '😎'],
            }),
            true,
          );
        });
        it('should proxy number as array of characters', async function () {
          await driver.setValue(1234.56, elementId as any);
          assert.strictEqual(
            proxyStub.calledOnceWithExactly(expectedEndpoint, expectedMethod, {
              value: ['1', '2', '3', '4', '.', '5', '6'],
            }),
            true,
          );
        });
        it('should proxy string array as array of characters', async function () {
          await driver.setValue(['hel', 'lo'], elementId as any);
          assert.strictEqual(
            proxyStub.calledOnceWithExactly(expectedEndpoint, expectedMethod, {
              value: ['h', 'e', 'l', 'l', 'o'],
            }),
            true,
          );
        });
        it('should proxy integer array as array of characters', async function () {
          await driver.setValue([1234] as any, elementId as any);
          assert.strictEqual(
            proxyStub.calledOnceWithExactly(expectedEndpoint, expectedMethod, {
              value: ['1', '2', '3', '4'],
            }),
            true,
          );
        });
      });

      describe('failure', function () {
        it('should throw invalid argument exception for null', async function () {
          await assert.rejects(driver.setValue(null as any, elementId as any), /supported/);
        });
        it('should throw invalid argument exception for object', async function () {
          await assert.rejects(driver.setValue({hi: 'there'} as any, elementId as any), /supported/);
        });
      });
    });

    describe('Web contest', function () {
      const elementId = 2;
      let atomElement: sinon.SinonStub;
      let executeAtom: sinon.SinonStub;
      let setValueWithWebAtom: sinon.SinonStub;
      const webEl = {ELEMENT: '5000', 'element-6066-11e4-a52e-4f735466cecf': '5000'};

      beforeEach(function () {
        driver.curContext = 'fake web context';
        atomElement = sandbox.stub(driver, 'getAtomsElement').returns(webEl);
        executeAtom = sandbox.stub(driver, 'executeAtom');
        setValueWithWebAtom = sandbox.stub(driver, 'setValueWithWebAtom');
      });

      afterEach(function () {
        sandbox.restore();
      });

      describe('setValueWithWebAtom', function () {
        it('with default', async function () {
          driver.opts.sendKeyStrategy = undefined;
          await driver.setValue('hello\uE006😀', elementId as any);
          assert.strictEqual(atomElement.calledOnce, true);
          assert.strictEqual(executeAtom.calledOnce, true);
          assert.strictEqual(setValueWithWebAtom.calledOnceWithExactly(webEl, 'hello\uE006😀'), true);
        });

        it('with oneByOne', async function () {
          driver.opts.sendKeyStrategy = 'oneByOne';
          await driver.setValue('hello\uE006😀', elementId as any);
          assert.strictEqual(atomElement.calledOnce, true);
          assert.strictEqual(executeAtom.calledOnce, true);
          assert.deepStrictEqual(setValueWithWebAtom.getCall(0).args, [webEl, 'h']);
          assert.deepStrictEqual(setValueWithWebAtom.getCall(1).args, [webEl, 'e']);
          assert.deepStrictEqual(setValueWithWebAtom.getCall(2).args, [webEl, 'l']);
          assert.deepStrictEqual(setValueWithWebAtom.getCall(3).args, [webEl, 'l']);
          assert.deepStrictEqual(setValueWithWebAtom.getCall(4).args, [webEl, 'o']);
          assert.deepStrictEqual(setValueWithWebAtom.getCall(5).args, [webEl, '\n']);
          assert.deepStrictEqual(setValueWithWebAtom.getCall(6).args, [webEl, '😀']);
        });
      });
    });
  });

  describe('getLocation for web elements', function () {
    let driver: XCUITestDriver;

    const webEl = {ELEMENT: '5000', 'element-6066-11e4-a52e-4f735466cecf': '5000'};
    const fixtureXOffset = 100;
    const fixtureYOffset = 200;

    let executeStub: sinon.SinonStub;
    let atomStub: sinon.SinonStub;

    beforeEach(function () {
      driver = new XCUITestDriver({} as any);
      driver.curContext = 'fake web context';
      executeStub = sandbox.stub(driver, 'execute').resolves([fixtureXOffset, fixtureYOffset]);
      sandbox.stub(driver, 'getAtomsElement').resolvesArg(0);
      atomStub = sandbox.stub(driver, 'executeAtom').resolves({x: 0, y: 0});
      proxyStub = sandbox.stub(driver, 'proxyCommand');
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should get location relative to scroll by default', async function () {
      const loc = await driver.getLocation(webEl);
      assert.strictEqual(executeStub.calledOnce, false);
      assert.strictEqual(atomStub.calledOnce, true);
      assert.strictEqual(atomStub.firstCall.args[0], 'get_top_left_coordinates');
      assert.strictEqual(loc.x, 0);
      assert.strictEqual(loc.y, 0);
    });

    it('should get location relative to document with absoluteWebLocations cap', async function () {
      driver.opts.absoluteWebLocations = true;
      const loc = await driver.getLocation(webEl);
      assert.strictEqual(executeStub.calledOnce, true);
      assert.strictEqual(atomStub.calledOnce, true);
      assert.strictEqual(atomStub.firstCall.args[0], 'get_top_left_coordinates');
      assert.strictEqual(loc.x, fixtureXOffset);
      assert.strictEqual(loc.y, fixtureYOffset);
    });
  });

  describe('getElementRect', function () {
    let driver: XCUITestDriver;
    let getNativeRectStub: sinon.SinonStub;
    let getLocationStub: sinon.SinonStub;
    let getSizeStub: sinon.SinonStub;
    let isWebContextStub: sinon.SinonStub;
    const elem = {ELEMENT: '5000'};

    beforeEach(function () {
      driver = new XCUITestDriver({} as any);
      getNativeRectStub = sandbox.stub(driver, 'getNativeRect').resolves({x: 0, y: 50, width: 100, height: 200});
      getLocationStub = sandbox.stub(driver, 'getLocation').resolves({x: 0, y: 50});
      getSizeStub = sandbox.stub(driver, 'getSize').resolves({width: 100, height: 200});
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should get element rect in native context', async function () {
      isWebContextStub = sandbox.stub(driver, 'isWebContext').returns(false);

      const rect = await driver.getElementRect(elem as any);

      assert.strictEqual(isWebContextStub.calledOnce, true);
      assert.strictEqual(getNativeRectStub.calledOnce, true);
      assert.strictEqual(getLocationStub.calledOnce, false);
      assert.strictEqual(getSizeStub.calledOnce, false);
      assert.strictEqual(rect.x, 0);
      assert.strictEqual(rect.y, 50);
      assert.strictEqual(rect.width, 100);
      assert.strictEqual(rect.height, 200);
    });

    it('should get element rect in Web context', async function () {
      isWebContextStub = sandbox.stub(driver, 'isWebContext').returns(true);

      const rect = await driver.getElementRect(elem as any);

      assert.strictEqual(isWebContextStub.calledOnce, true);
      assert.strictEqual(getNativeRectStub.calledOnce, false);
      assert.strictEqual(getLocationStub.calledOnce, true);
      assert.strictEqual(getSizeStub.calledOnce, true);
      assert.strictEqual(rect.x, 0);
      assert.strictEqual(rect.y, 50);
      assert.strictEqual(rect.width, 100);
      assert.strictEqual(rect.height, 200);
    });
  });
});
