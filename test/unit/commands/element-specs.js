// eslint-disable-next-line
import sinon, {createSandbox} from 'sinon';
import {XCUITestDriver} from '../../../lib/driver';


describe('element commands', function () {
  let sandbox;

  /** @type {XCUITestDriver} */
  let driver;

  let chai;

  /** @type {sinon.SinonStubbedMember<XCUITestDriver['proxyCommand']>} */
  let proxyStub;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    driver = new XCUITestDriver();
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
      driver.setValue.calledOnceWithExactly('hello', '2').should.be.true;
      driver.setValue.returned(undefined).should.be.true;
    });
  });

  describe('getAttribute', function () {
    const elementId = 2;
    const attribute = 'enabled';

    afterEach(function () {
      proxyStub.calledOnce.should.be.true;
    });

    it('should properly parse boolean true attribute presented as integer', async function () {
      proxyStub.resolves(1);
      (await driver.getAttribute(attribute, elementId)).should.eql('true');
    });

    it('should properly parse boolean false attribute presented as integer', async function () {
      proxyStub.resolves(0);
      (await driver.getAttribute(attribute, elementId)).should.eql('false');
    });

    it('should properly parse integer attribute presented as string', async function () {
      proxyStub.resolves('0');
      (await driver.getAttribute(attribute, elementId)).should.eql('0');
    });

    it('should properly parse boolean attribute presented as bool', async function () {
      proxyStub.resolves(false);
      (await driver.getAttribute(attribute, elementId)).should.eql('false');
    });

    it('should properly parse null attribute', async function () {
      proxyStub.resolves(null);
      await chai.expect(driver.getAttribute(attribute, elementId)).to.eventually.be.null;
    });

    it('should properly parse string attribute', async function () {
      proxyStub.resolves('value');
      (await driver.getAttribute(attribute, elementId)).should.eql('value');
    });
  });

  describe('getProperty', function () {
    const elementId = 2;
    const property = 'enabled';

    afterEach(function () {
      proxyStub.calledOnce.should.be.true;
    });

    it('should properly parse boolean true attribute presented as integer', async function () {
      proxyStub.resolves(1);
      (await driver.getProperty(property, elementId)).should.eql('true');
    });

    it('should properly parse boolean false attribute presented as integer', async function () {
      proxyStub.resolves(0);
      (await driver.getProperty(property, elementId)).should.eql('false');
    });

    it('should properly parse integer attribute presented as string', async function () {
      proxyStub.resolves('0');
      (await driver.getProperty(property, elementId)).should.eql('0');
    });

    it('should properly parse boolean attribute presented as bool', async function () {
      proxyStub.resolves(false);
      (await driver.getProperty(property, elementId)).should.eql('false');
    });

    it('should properly parse null attribute', async function () {
      proxyStub.resolves(null);
      await chai.expect(driver.getProperty(property, elementId)).to.eventually.be.null;
    });

    it('should properly parse string attribute', async function () {
      proxyStub.resolves('value');
      (await driver.getProperty(property, elementId)).should.eql('value');
    });
  });

  describe('getAttribute - special contentSize', function () {
    it('should call the internal method instead of WDA', async function () {
      const getContentSizeStub = sandbox.stub(driver, 'getContentSize');
      getContentSizeStub.resolves('foo');
      (await driver.getAttribute('contentSize', 2)).should.eql('foo');
      proxyStub.called.should.be.false;
      getContentSizeStub.calledOnce.should.be.true;
    });
  });

  describe('getContentSize', function () {
    const el = {ELEMENT: '1234'};
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getAttribute']>} */
    let getAttrStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getElementRect']>} */
    let getRectStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['findElOrEls']>} */
    let findElStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getSize']>} */
    let getSizeStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getLocationInView']>} */
    let getLocationStub;

    beforeEach(function () {
      getAttrStub = sandbox.stub(driver, 'getAttribute');
      getRectStub = sandbox.stub(driver, 'getElementRect');
      findElStub = sandbox.stub(driver, 'findElOrEls');
      getSizeStub = sandbox.stub(driver, 'getSize');
      getLocationStub = sandbox.stub(driver, 'getLocationInView');
    });

    describe('web context', function () {
      /** @type {XCUITestDriver['curContext']} */
      let oldContext;

      beforeEach(function () {
        oldContext = driver.curContext;
        driver.curContext = 'WEBVIEW';
      });
      afterEach(function () {
        driver.curContext = oldContext;
      });
      it('should throw when in a web context', async function () {
      await driver.getContentSize(el).should.be.rejectedWith(/not yet implemented/);
      });
    });

    it('should throw if trying to get contentSize of something other than table or collection', async function () {
      getAttrStub.resolves('XCUIElementTypeStatusBar');
      await driver.getContentSize(el).should.be.rejectedWith(/Can't get content size for type/);
    });

    it('should simply get the rect if just one child', async function () {
      getAttrStub.resolves('XCUIElementTypeTable');
      findElStub.resolves([{ELEMENT: 'foo'}]);
      getRectStub.resolves({x: 0, y: 0, height: 100, width: 200});
      getSizeStub.resolves({height: 100, width: 200});
      getLocationStub.resolves({x: 0, y: 0});
      const contentSizeObj = JSON.parse(await driver.getContentSize(el));
      contentSizeObj.should.eql({
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset: 100,
      });
      getRectStub.calledOnce.should.be.true;
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
      const contentSizeObj = JSON.parse(await driver.getContentSize(el));
      contentSizeObj.should.eql({
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset: 170,
      });
      getRectStub.calledTwice.should.be.true;
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
      const contentSizeObj = JSON.parse(await driver.getContentSize(el));
      contentSizeObj.should.eql({
        width: 200,
        height: 100,
        top: 0,
        left: 0,
        scrollableOffset,
      });
      getRectStub.calledThrice.should.be.true;
    });
  });

  describe('setValue', function () {
    describe('Native contest', function () {
      const elementId = 2;
      const expectedEndpoint = `/element/${elementId}/value`;
      const expectedMethod = 'POST';

      describe('success', function () {
        it('should proxy string as array of characters', async function () {
          await driver.setValue('hello\uE006', elementId);
          proxyStub.calledOnceWith(expectedEndpoint, expectedMethod, {
            value: ['h', 'e', 'l', 'l', 'o', '\n'],
          }).should.be.true;
        });
        it('should proxy string with smileys as array of characters', async function () {
          await driver.setValue('hello😀😎', elementId);
          proxyStub.calledOnceWith(expectedEndpoint, expectedMethod, {
            value: ['h', 'e', 'l', 'l', 'o', '😀', '😎'],
          }).should.be.true;
        });
        it('should proxy number as array of characters', async function () {
          await driver.setValue(1234.56, elementId);
          proxyStub.calledOnceWith(expectedEndpoint, expectedMethod, {
            value: ['1', '2', '3', '4', '.', '5', '6'],
          }).should.be.true;
        });
        it('should proxy string array as array of characters', async function () {
          await driver.setValue(['hel', 'lo'], elementId);
          proxyStub.calledOnceWith(expectedEndpoint, expectedMethod, {
            value: ['h', 'e', 'l', 'l', 'o'],
          }).should.be.true;
        });
        it('should proxy integer array as array of characters', async function () {
          await driver.setValue([1234], elementId);
          proxyStub.calledOnceWith(expectedEndpoint, expectedMethod, {
            value: ['1', '2', '3', '4'],
          }).should.be.true;
        });
      });

      describe('failure', function () {
        it('should throw invalid argument exception for null', async function () {
          await driver.setValue(null, elementId).should.be.rejectedWith(/supported/);
        });
        it('should throw invalid argument exception for object', async function () {
          await driver.setValue({hi: 'there'}, elementId).should.be.rejectedWith(/supported/);
        });
      });
    });

    describe('Web contest', function () {
      const elementId = 2;

      /** @type {sinon.SinonStubbedMember<XCUITestDriver['getAtomsElement']>} */
      let atomElement;
      /** @type {sinon.SinonStubbedMember<XCUITestDriver['executeAtom']>} */
      let executeAtom;
      /** @type {sinon.SinonStubbedMember<XCUITestDriver['setValueWithWebAtom']>} */
      let setValueWithWebAtom;
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
          await driver.setValue('hello\uE006😀', elementId);
          atomElement.calledOnce.should.be.true;
          executeAtom.calledOnce.should.be.true;
          setValueWithWebAtom.calledOnceWith(
            webEl,
            'hello\uE006😀'
          ).should.be.true;
        });

        it('with oneByOne', async function () {
          driver.opts.sendKeyStrategy = 'oneByOne';
          await driver.setValue('hello\uE006😀', elementId);
          atomElement.calledOnce.should.be.true;
          executeAtom.calledOnce.should.be.true;
          setValueWithWebAtom.getCall(0).args.should.eql([webEl, 'h']);
          setValueWithWebAtom.getCall(1).args.should.eql([webEl, 'e']);
          setValueWithWebAtom.getCall(2).args.should.eql([webEl, 'l']);
          setValueWithWebAtom.getCall(3).args.should.eql([webEl, 'l']);
          setValueWithWebAtom.getCall(4).args.should.eql([webEl, 'o']);
          setValueWithWebAtom.getCall(5).args.should.eql([webEl, '\n']);
          setValueWithWebAtom.getCall(6).args.should.eql([webEl, '😀']);
        });
      });
    });
  });

  describe('getLocation for web elements', function () {
    /** @type {XCUITestDriver} */
    let driver;

    const webEl = {ELEMENT: '5000', 'element-6066-11e4-a52e-4f735466cecf': '5000'};
    const fixtureXOffset = 100;
    const fixtureYOffset = 200;

    /** @type {sinon.SinonStubbedMember<XCUITestDriver['execute']>} */
    let executeStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['executeAtom']>} */
    let atomStub;

    beforeEach(function () {
      driver = new XCUITestDriver();
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
    /** @type {XCUITestDriver} */
    let driver;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getNativeRect']>} */
    let getNativeRectStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getLocationInView']>} */
    let getLocationStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['getSize']>} */
    let getSizeStub;
    /** @type {sinon.SinonStubbedMember<XCUITestDriver['isWebContext']>} */
    let isWebContextStub;
    const elem = {ELEMENT: '5000'};

    beforeEach(function () {
      driver = new XCUITestDriver();
      getNativeRectStub = sandbox
        .stub(driver, 'getNativeRect')
        .resolves({x: 0, y: 50, width: 100, height: 200});
      getLocationStub = sandbox.stub(driver, 'getLocation').resolves({x: 0, y: 50});
      getSizeStub = sandbox.stub(driver, 'getSize').resolves({width: 100, height: 200});
    });

    afterEach(function () {
      sandbox.restore();
    });

    it('should get element rect in native context', async function () {
      isWebContextStub = sandbox.stub(driver, 'isWebContext').returns(false);

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
      isWebContextStub = sandbox.stub(driver, 'isWebContext').returns(true);

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
