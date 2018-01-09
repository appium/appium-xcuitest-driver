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
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  afterEach(function () {
    proxySpy.reset();
  });

  describe('setValueImmediate', withMocks({driver}, (mocks) => {
    it('should call setValue', async function () {
      mocks.driver
        .expects('setValue')
        .once().withExactArgs('hello', 2).returns();
      await driver.setValueImmediate('hello', 2);
      mocks.driver.verify();
    });
  }));

  describe('getAttribute', function () {
    const elementId = 2;
    const attribute = 'enabled';

    afterEach(function () {
      proxySpy.calledOnce.should.be.true;
    });

    it('should properly parse boolean true attribute presented as integer', async function () {
      proxySpy.returns(1);
      (await driver.getAttribute(attribute, elementId)).should.eql('true');
    });

    it('should properly parse boolean false attribute presented as integer', async function () {
      proxySpy.returns(0);
      (await driver.getAttribute(attribute, elementId)).should.eql('false');
    });

    it('should properly parse integer attribute presented as string', async function () {
      proxySpy.returns('0');
      (await driver.getAttribute(attribute, elementId)).should.eql('0');
    });

    it('should properly parse boolean attribute presented as bool', async function () {
      proxySpy.returns(false);
      (await driver.getAttribute(attribute, elementId)).should.eql('false');
    });

    it('should properly parse null attribute', async function () {
      proxySpy.returns(null);
      _.isNull(await driver.getAttribute(attribute, elementId)).should.be.true;
    });

    it('should properly parse string attribute', async function () {
      proxySpy.returns('value');
      (await driver.getAttribute(attribute, elementId)).should.eql('value');
    });
  });

  describe('getAttribute - special contentSize', withSandbox({}, function (S) {
    const attr = 'contentSize', elId = 2;

    it('should call the internal method instead of WDA', async function () {
      let getContentSizeSpy = S.sandbox.stub(driver, 'getContentSize');
      getContentSizeSpy.returns('foo');
      (await driver.getAttribute(attr, elId)).should.eql('foo');
      proxySpy.called.should.be.false;
      getContentSizeSpy.calledOnce.should.be.true;
    });
  }));

  describe('getContentSize', withSandbox({}, function (S) {
    const el = {ELEMENT: '1234'};
    let getAttrSpy, getRectSpy, findElSpy, getSizeSpy, getLocationSpy;

    beforeEach(function () {
      getAttrSpy = S.sandbox.stub(driver, 'getAttribute');
      getRectSpy = S.sandbox.stub(driver, 'getRect');
      findElSpy = S.sandbox.stub(driver, 'findElOrEls');
      getSizeSpy = S.sandbox.stub(driver, 'getSize');
      getLocationSpy = S.sandbox.stub(driver, 'getLocationInView');
    });

    it('should throw when in a web context', async function () {
      let oldContext = driver.curContext;
      driver.curContext = 'WEBVIEW';
      await driver.getContentSize(el).should.eventually.be.rejectedWith(/not yet implemented/);
      driver.curContext = oldContext;
    });

    it('should throw if trying to get contentSize of something other than table or collection', async function () {
      getAttrSpy.returns('XCUIElementTypeStatusBar');
      await driver.getContentSize(el).should.eventually.be.rejectedWith(/Can't get content size for type/);
    });

    it('should simply get the rect if just one child', async function () {
      getAttrSpy.returns('XCUIElementTypeTable');
      findElSpy.returns([{ELEMENT: 'foo'}]);
      getRectSpy.returns({x: 0, y: 0, height: 100, width: 200});
      getSizeSpy.returns({height: 100, width: 200});
      getLocationSpy.returns({x: 0, y: 0});
      const contentSizeObj = JSON.parse(await driver.getContentSize(el));
      contentSizeObj.should.eql({
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset: 100
      });
      getRectSpy.calledOnce.should.be.true;
    });

    it('should get simple difference in element positions of a table', async function () {
      const el1 = {ELEMENT: 1}, el2 = {ELEMENT: 2};
      getAttrSpy.returns('XCUIElementTypeTable');
      findElSpy.returns([el1, el2]);
      getRectSpy.withArgs(el1).returns({x: 0, y: 10, width: 50, height: 60});
      getRectSpy.withArgs(el2).returns({x: 10, y: 80, width: 60, height: 100});
      getSizeSpy.returns({height: 100, width: 200});
      getLocationSpy.returns({x: 0, y: 0});
      const contentSizeObj = JSON.parse(await driver.getContentSize(el));
      contentSizeObj.should.eql({
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset: 170
      });
      getRectSpy.calledTwice.should.be.true;
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
      getAttrSpy.returns('XCUIElementTypeCollectionView');
      findElSpy.returns(fixtures.map(el => ({ELEMENT: el.id})));
      for (let item of fixtures) {
        getRectSpy.withArgs({ELEMENT: item.id}).returns(item);
      }
      getSizeSpy.returns({height: 100, width: 200});
      getLocationSpy.returns({x: 0, y: 0});
      const contentSizeObj = JSON.parse(await driver.getContentSize(el));
      contentSizeObj.should.eql({
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset
      });
      getRectSpy.callCount.should.equal(3);
    });
  }));

  describe('setValue', function () {
    const elementId = 2;
    const expectedEndpoint = `/element/${elementId}/value`;
    const expectedMethod = 'POST';

    describe('success', function () {
      afterEach(function () {
        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql(expectedEndpoint);
        proxySpy.firstCall.args[1].should.eql(expectedMethod);
      });

      it('should proxy string as array of characters', async function () {
        await driver.setValue('hello', elementId);
        proxySpy.firstCall.args[2].should.eql({value: ['h', 'e', 'l', 'l', 'o']});
      });
      it('should proxy integer as array of characters', async function () {
        await driver.setValue(1234, elementId);
        proxySpy.firstCall.args[2].should.eql({value: ['1', '2', '3', '4']});
      });
      it('should proxy string array as array of characters', async function () {
        await driver.setValue(['hel', 'lo'], elementId);
        proxySpy.firstCall.args[2].should.eql({value: ['h', 'e', 'l', 'l', 'o']});
      });
      it('should proxy integer array as array of characters', async function () {
        await driver.setValue([1234], elementId);
        proxySpy.firstCall.args[2].should.eql({value: ['1', '2', '3', '4']});
      });
    });

    describe('failure', function () {
      it('should throw invalid argument exception for null', async function () {
        await driver.setValue(null, elementId)
          .should.eventually.be.rejectedWith(/Only strings and arrays of strings are supported as input arguments. Received: 'null'/);
      });
      it('should throw invalid argument exception for object', async function () {
        await driver.setValue({hi: 'there'}, elementId)
          .should.eventually.be.rejectedWith(/Only strings and arrays of strings are supported as input arguments. Received: '{"hi":"there"}'/);
      });
    });
  });

  describe('getLocation for web elements', () => {
    let driver = new XCUITestDriver();
    const oldContext = driver.curContext;
    const webEl = {ELEMENT: '5000'};
    const fixtureXOffset = 100, fixtureYOffset = 200;
    let executeStub = sinon.stub(driver, 'execute');
    executeStub.returns([fixtureXOffset, fixtureYOffset]);
    let atomsElStub = sinon.stub(driver, 'useAtomsElement', (el) => el);
    let atomStub = sinon.stub(driver, 'executeAtom');
    let proxyStub = sinon.stub(driver, 'proxyCommand');
    atomStub.returns({x: 0, y: 0});

    beforeEach(() => {
      driver.curContext = "fake web context";
    });

    afterEach(() => {
      driver.curContext = oldContext;
      executeStub.reset();
      atomsElStub.reset();
      atomStub.reset();
      proxyStub.reset();
    });

    it('should get location relative to scroll by default', async () => {
      const loc = await driver.getLocation(webEl);
      executeStub.calledOnce.should.be.false;
      atomStub.calledOnce.should.be.true;
      atomStub.firstCall.args[0].should.eql('get_top_left_coordinates');
      loc.x.should.equal(0);
      loc.y.should.equal(0);
    });

    it('should get location relative to document with abosluteWebLocations cap', async () => {
      driver.opts.absoluteWebLocations = true;
      const loc = await driver.getLocation(webEl);
      executeStub.calledOnce.should.be.true;
      atomStub.calledOnce.should.be.true;
      atomStub.firstCall.args[0].should.eql('get_top_left_coordinates');
      loc.x.should.equal(fixtureXOffset);
      loc.y.should.equal(fixtureYOffset);
    });
  });
});
