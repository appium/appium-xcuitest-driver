import sinon from 'sinon';
import XCUITestDriver from '../../..';
import { fs, tempDir } from 'appium-support';

const simctlModule = require('node-simctl');
const teenProcessModule = require('teen_process');

describe('screenshots commands', () => {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');
  let simctlSpy = sinon.stub(simctlModule, 'getScreenshot');

  const base64Response = 'aGVsbG8=';

  afterEach(() => {
    proxySpy.reset();
    simctlSpy.reset();
  });

  describe('getScreenshot', () => {
    it('should get a screenshot from WDA if no errors are detected', async function () {
      proxySpy.returns(base64Response);
      driver.opts.realDevice = false;

      await driver.getScreenshot();

      proxySpy.calledOnce.should.be.true;
      proxySpy.firstCall.args[0].should.eql('/screenshot');
      proxySpy.firstCall.args[1].should.eql('GET');

      simctlSpy.notCalled.should.be.true;
    });

    it('should get a screenshot from simctl for simulator if WDA call fails and Xcode version >= 8.1', async function () {
      proxySpy.returns(null);
      simctlSpy.returns(base64Response);

      driver.opts.realDevice = false;
      driver.xcodeVersion = {
        versionFloat: 8.3
      };
      const result = await driver.getScreenshot();
      result.should.equal(base64Response);

      proxySpy.calledOnce.should.be.true;
      simctlSpy.calledOnce.should.be.true;
    });

    it('should use idevicescreenshot to take a screenshot on real device', async function () {
      const toolName = 'idevicescreenshot';
      const tiffPath = '/some/file.tiff';
      const pngPath = '/some/file.png';
      const udid = '1234';
      const pngFileContent = 'blabla';
      const fsExistsSpy = sinon.stub(fs, 'exists');
      fsExistsSpy.returns(true);
      const fsWhichSpy = sinon.stub(fs, 'which');
      fsWhichSpy.returns(toolName);
      const fsRimRafSpy = sinon.stub(fs, 'rimraf');
      const fsReadFileSpy = sinon.stub(fs, 'readFile');
      fsReadFileSpy.returns(pngFileContent);
      const execSpy = sinon.stub(teenProcessModule, 'exec');
      const pathSpy = sinon.stub(tempDir, 'path');
      pathSpy.withArgs({prefix: `screenshot-${udid}`, suffix: '.tiff'}).returns(tiffPath);
      pathSpy.withArgs({prefix: `screenshot-${udid}`, suffix: '.png'}).returns(pngPath);
      proxySpy.returns('LANDSCAPE');

      try {
        driver.opts.realDevice = true;
        driver.opts.udid = udid;
        (await driver.getScreenshot()).should.eql(pngFileContent.toString('base64'));

        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/orientation');
        proxySpy.firstCall.args[1].should.eql('GET');

        fsWhichSpy.calledOnce.should.be.true;
        fsWhichSpy.firstCall.args[0].should.eql(toolName);

        execSpy.calledTwice.should.be.true;
        execSpy.firstCall.args[0].should.eql(toolName);
        execSpy.firstCall.args[1].should.eql(['-u', udid, tiffPath]);
        execSpy.secondCall.args[0].should.eql('sips');
        execSpy.secondCall.args[1].should.eql(
          ['-r', '-90', '-s', 'format', 'png', tiffPath, '--out', pngPath]);

        fsRimRafSpy.callCount.should.eql(4);

        fsReadFileSpy.calledOnce.should.be.true;
        fsReadFileSpy.firstCall.args[0].should.eql(pngPath);

        pathSpy.calledTwice.should.be.true;
      } finally {
        fsExistsSpy.restore();
        fsWhichSpy.restore();
        fsReadFileSpy.restore();
        fsRimRafSpy.restore();
        execSpy.restore();
        pathSpy.restore();
      }
    });
  });
});
