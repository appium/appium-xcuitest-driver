import sinon from 'sinon';
import XCUITestDriver from '../../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { withMocks, withSandbox } from 'appium-test-support';
import _ from 'lodash';


chai.should();
chai.use(chaiAsPromised);

describe('element commands', function () {
  let driver = new XCUITestDriver();
  let proxyStub = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxyStub.reset();
  });

  describe('setValueImmediate', withMocks({driver}, (mocks) => {
    afterEach(function () {
      mocks.verify();
    });
    it('should call setValue', async function () {
      mocks.driver
        .expects('setValue')
        .once().withExactArgs('hello', 2).returns();
      await driver.setValueImmediate('hello', 2);
    });
  }));

  describe('getAttribute', function () {
    const elementId = 2;
    const attribute = 'enabled';

    afterEach(function () {
      proxyStub.calledOnce.should.be.true;
    });

    it('should properly parse boolean true attribute presented as integer', async function () {
      proxyStub.returns(1);
      (await driver.getAttribute(attribute, elementId)).should.eql('true');
    });

    it('should properly parse boolean false attribute presented as integer', async function () {
      proxyStub.returns(0);
      (await driver.getAttribute(attribute, elementId)).should.eql('false');
    });

    it('should properly parse integer attribute presented as string', async function () {
      proxyStub.returns('0');
      (await driver.getAttribute(attribute, elementId)).should.eql('0');
    });

    it('should properly parse boolean attribute presented as bool', async function () {
      proxyStub.returns(false);
      (await driver.getAttribute(attribute, elementId)).should.eql('false');
    });

    it('should properly parse null attribute', async function () {
      proxyStub.returns(null);
      _.isNull(await driver.getAttribute(attribute, elementId)).should.be.true;
    });

    it('should properly parse string attribute', async function () {
      proxyStub.returns('value');
      (await driver.getAttribute(attribute, elementId)).should.eql('value');
    });
  });

  describe('getAttribute - special contentSize', withSandbox({}, function (S) {
    it('should call the internal method instead of WDA', async function () {
      const getContentSizeStub = S.sandbox.stub(driver, 'getContentSize');
      getContentSizeStub.returns('foo');
      (await driver.getAttribute('contentSize', 2)).should.eql('foo');
      proxyStub.called.should.be.false;
      getContentSizeStub.calledOnce.should.be.true;
    });
  }));

  describe('getContentSize', withSandbox({}, function (S) {
    const el = {ELEMENT: '1234'};
    let getAttrStub, getRectStub, findElStub, getSizeStub, getLocationStub;

    beforeEach(function () {
      getAttrStub = S.sandbox.stub(driver, 'getAttribute');
      getRectStub = S.sandbox.stub(driver, 'getElementRect');
      findElStub = S.sandbox.stub(driver, 'findElOrEls');
      getSizeStub = S.sandbox.stub(driver, 'getSize');
      getLocationStub = S.sandbox.stub(driver, 'getLocationInView');
    });

    describe('web context', function () {
      const oldContext = driver.curContext;
      beforeEach(function () {
        driver.curContext = 'WEBVIEW';
      });
      afterEach(function () {
        driver.curContext = oldContext;
      });
      it('should throw when in a web context', async function () {
        await driver.getContentSize(el).should.eventually.be.rejectedWith(/not yet implemented/);
      });
    });

    it('should throw if trying to get contentSize of something other than table or collection', async function () {
      getAttrStub.returns('XCUIElementTypeStatusBar');
      await driver.getContentSize(el).should.eventually.be.rejectedWith(/Can't get content size for type/);
    });

    it('should simply get the rect if just one child', async function () {
      getAttrStub.returns('XCUIElementTypeTable');
      findElStub.returns([{ELEMENT: 'foo'}]);
      getRectStub.returns({x: 0, y: 0, height: 100, width: 200});
      getSizeStub.returns({height: 100, width: 200});
      getLocationStub.returns({x: 0, y: 0});
      const contentSizeObj = JSON.parse(await driver.getContentSize(el));
      contentSizeObj.should.eql({
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset: 100
      });
      getRectStub.calledOnce.should.be.true;
    });

    it('should get simple difference in element positions of a table', async function () {
      const el1 = {ELEMENT: 1}, el2 = {ELEMENT: 2};
      getAttrStub.returns('XCUIElementTypeTable');
      findElStub.returns([el1, el2]);
      getRectStub.withArgs(el1).returns({x: 0, y: 10, width: 50, height: 60});
      getRectStub.withArgs(el2).returns({x: 10, y: 80, width: 60, height: 100});
      getSizeStub.returns({height: 100, width: 200});
      getLocationStub.returns({x: 0, y: 0});
      const contentSizeObj = JSON.parse(await driver.getContentSize(el));
      contentSizeObj.should.eql({
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset: 170
      });
      getRectStub.calledTwice.should.be.true;
    });

    it('should be sensitive to row items in the case of a collection view', async function () {
      // set up a collection view with 3 rows of 2 elements.
      // give the last row just one element
      const fixtures = [
        {id: 1, x: 0, y: 0, height: 50}, {id: 2, x: 50, y: 0, height: 50},
        {id: 3, x: 0, y: 60, height: 50}, {id: 4, x: 50, y: 60, height: 50},
        {id: 5, x: 0, y: 120, height: 50}
      ];
      const scrollableOffset = 170; // 3 rows plus space between two
      getAttrStub.returns('XCUIElementTypeCollectionView');
      findElStub.returns(fixtures.map((el) => ({ELEMENT: el.id})));
      for (const item of fixtures) {
        getRectStub.withArgs({ELEMENT: item.id}).returns(item);
      }
      getSizeStub.returns({height: 100, width: 200});
      getLocationStub.returns({x: 0, y: 0});
      const contentSizeObj = JSON.parse(await driver.getContentSize(el));
      contentSizeObj.should.eql({
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset
      });
      getRectStub.callCount.should.equal(3);
    });
  }));

  describe('setValue', function () {
    const elementId = 2;
    const expectedEndpoint = `/element/${elementId}/value`;
    const expectedMethod = 'POST';

    describe('success', function () {
      afterEach(function () {
        proxyStub.calledOnce.should.be.true;
        proxyStub.firstCall.args[0].should.eql(expectedEndpoint);
        proxyStub.firstCall.args[1].should.eql(expectedMethod);
      });

      it('should proxy string as array of characters', async function () {
        await driver.setValue('hello\uE006', elementId);
        proxyStub.firstCall.args[2].should.eql({value: ['h', 'e', 'l', 'l', 'o', '\n']});
      });
      it('should proxy string with smileys as array of characters', async function () {
        await driver.setValue('hello😀😎', elementId);
        proxyStub.firstCall.args[2].should.eql({value: ['h', 'e', 'l', 'l', 'o', '😀', '😎']});
      });
      it('should proxy number as array of characters', async function () {
        await driver.setValue(1234.56, elementId);
        proxyStub.firstCall.args[2].should.eql({value: ['1', '2', '3', '4', '.', '5', '6']});
      });
      it('should proxy string array as array of characters', async function () {
        await driver.setValue(['hel', 'lo'], elementId);
        proxyStub.firstCall.args[2].should.eql({value: ['h', 'e', 'l', 'l', 'o']});
      });
      it('should proxy integer array as array of characters', async function () {
        await driver.setValue([1234], elementId);
        proxyStub.firstCall.args[2].should.eql({value: ['1', '2', '3', '4']});
      });
    });

    describe('failure', function () {
      it('should throw invalid argument exception for null', async function () {
        await driver.setValue(null, elementId)
          .should.eventually.be.rejectedWith(/supported/);
      });
      it('should throw invalid argument exception for object', async function () {
        await driver.setValue({hi: 'there'}, elementId)
          .should.eventually.be.rejectedWith(/supported/);
      });
    });
  });

  describe('getLocation for web elements', function () {
    let driver = new XCUITestDriver();
    const oldContext = driver.curContext;
    const webEl = {ELEMENT: '5000'};
    const fixtureXOffset = 100, fixtureYOffset = 200;
    let executeStub;
    let atomsElStub;
    let atomStub;
    let proxyStub;

    before(function () {
      executeStub = sinon.stub(driver, 'execute').returns([fixtureXOffset, fixtureYOffset]);
      atomsElStub = sinon.stub(driver, 'useAtomsElement').callsFake((el) => el);
      atomStub = sinon.stub(driver, 'executeAtom').returns({x: 0, y: 0});
      proxyStub = sinon.stub(driver, 'proxyCommand');
    });
    after(function () {
      executeStub.reset();
      atomsElStub.reset();
      atomStub.reset();
      proxyStub.reset();
    });

    beforeEach(function () {
      driver.curContext = 'fake web context';
    });
    afterEach(function () {
      driver.curContext = oldContext;

      executeStub.resetHistory();
      atomsElStub.resetHistory();
      atomStub.resetHistory();
      proxyStub.resetHistory();
    });

    it('should get location relative to scroll by default', async function () {
      const loc = await driver.getLocation(webEl);
      executeStub.calledOnce.should.be.false;
      atomStub.calledOnce.should.be.true;
      atomStub.firstCall.args[0].should.eql('get_top_left_coordinates');
      loc.x.should.equal(0);
      loc.y.should.equal(0);
    });

    it('should get location relative to document with absoluteWebLocations cap', async function () {
      driver.opts.absoluteWebLocations = true;
      const loc = await driver.getLocation(webEl);
      executeStub.calledOnce.should.be.true;
      atomStub.calledOnce.should.be.true;
      atomStub.firstCall.args[0].should.eql('get_top_left_coordinates');
      loc.x.should.equal(fixtureXOffset);
      loc.y.should.equal(fixtureYOffset);
    });
  });

  describe('getElementRect', function () {
    let driver = new XCUITestDriver();
    const elem = {ELEMENT: '5000'};
    const getNativeRectStub = sinon.stub(driver, 'getNativeRect').returns({x: 0, y: 50, width: 100, height: 200});
    const getLocationStub = sinon.stub(driver, 'getLocation').returns({x: 0, y: 50});
    const getSizeStub = sinon.stub(driver, 'getSize').returns({width: 100, height: 200});
    let isWebContextStub;

    afterEach(function () {
      getNativeRectStub.resetHistory();
      getLocationStub.resetHistory();
      getSizeStub.resetHistory();
      proxyStub.resetHistory();
      if (isWebContextStub) {
        isWebContextStub.restore();
      }
    });

    it('should get element rect in native context', async function () {
      isWebContextStub = sinon.stub(driver, 'isWebContext').returns(false);

      const rect = await driver.getElementRect(elem);

      isWebContextStub.calledOnce.should.be.true;
      getNativeRectStub.calledOnce.should.be.true;
      getLocationStub.calledOnce.should.be.false;
      getSizeStub.calledOnce.should.be.false;
      rect.x.should.eql(0);
      rect.y.should.eql(50);
      rect.width.should.eql(100);
      rect.height.should.eql(200);
    });

    it('should get element rect in Web context', async function () {
      isWebContextStub = sinon.stub(driver, 'isWebContext').returns(true);

      const rect = await driver.getElementRect(elem);

      isWebContextStub.calledOnce.should.be.true;
      getNativeRectStub.calledOnce.should.be.false;
      getLocationStub.calledOnce.should.be.true;
      getSizeStub.calledOnce.should.be.true;
      rect.x.should.eql(0);
      rect.y.should.eql(50);
      rect.width.should.eql(100);
      rect.height.should.eql(200);
    });
  });
});
