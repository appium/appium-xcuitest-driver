import sinon from 'sinon';
import XCUITestDriver from '../../..';
import chai from 'chai';

chai.should();

describe('session commands', () => {
  let driver = new XCUITestDriver();
  driver.opts.udid = "cecinestpasuneudid";
  let proxySpy = sinon.stub(driver, 'proxyCommand', async (endpoint, method) => {
    if (endpoint === "/" && method === "GET") {
      return {
        capabilities: {
          sillyCap: true,
          app: "LOL.app",
        }
      };
    }
    return {};
  });

  afterEach(() => {
    proxySpy.reset();
  });

  describe('getSession', () => {
    it('should merge caps with WDA response', async () => {
      driver.caps = {
        platformName: "iOS",
        javascript_enabled: true,
        app: "NOTLOL.app",
      };
      let res = await driver.getSession();
      proxySpy.calledOnce.should.be.true;
      res.should.eql({
        sillyCap: true,
        app: "LOL.app",
        platformName: "iOS",
        javascript_enabled: true,
        udid: "cecinestpasuneudid",
      });
    });
  });
});
