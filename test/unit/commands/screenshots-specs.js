import sinon from 'sinon';
import XCUITestDriver from '../../..';
import { fs, tempDir } from 'appium-support';

const simctlModule = require('node-simctl');
const teenProcessModule = require('teen_process');

describe('screenshots commands', function () {
  let driver = new XCUITestDriver();
  let proxySpy = sinon.stub(driver, 'proxyCommand');

  const base64Response = 'aGVsbG8=';

  afterEach(function () {
    proxySpy.reset();
  });

  describe('getScreenshot', function () {
    describe('simulator', function () {
      let simctlSpy = sinon.stub(simctlModule, 'getScreenshot');

      afterEach(function () {
        simctlSpy.reset();
      });

      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxySpy.returns(base64Response);
        driver.opts.realDevice = false;

        await driver.getScreenshot();

        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/screenshot');
        proxySpy.firstCall.args[1].should.eql('GET');

        simctlSpy.notCalled.should.be.true;
      });

      it('should get a screenshot from simctl if WDA call fails and Xcode version >= 8.1', async function () {
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
    });

    describe('real device', function () {
      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxySpy.returns(base64Response);
        driver.opts.realDevice = true;

        await driver.getScreenshot();

        proxySpy.calledOnce.should.be.true;
        proxySpy.firstCall.args[0].should.eql('/screenshot');
        proxySpy.firstCall.args[1].should.eql('GET');
      });

      it('should use idevicescreenshot if WDA fails', async function () {
        const tiffPath = '/some/file.tiff';
        const pngPath = '/some/file.png';
        const udid = '1234';

        const fsExistsSpy = sinon.stub(fs, 'exists');
        fsExistsSpy.returns(true);

        const toolName = 'idevicescreenshot';
        const fsWhichSpy = sinon.stub(fs, 'which');
        fsWhichSpy.returns(toolName);

        const fsRimRafSpy = sinon.stub(fs, 'rimraf');

        const pngFileContent = 'blabla';
        const fsReadFileSpy = sinon.stub(fs, 'readFile');
        fsReadFileSpy.returns(pngFileContent);

        const execSpy = sinon.stub(teenProcessModule, 'exec');

        const pathSpy = sinon.stub(tempDir, 'path');
        pathSpy.withArgs({prefix: `screenshot-${udid}`, suffix: '.tiff'}).returns(tiffPath);
        pathSpy.withArgs({prefix: `screenshot-${udid}`, suffix: '.png'}).returns(pngPath);

        proxySpy.onFirstCall().returns(null);
        proxySpy.onSecondCall().returns('LANDSCAPE');

        try {
          driver.opts.realDevice = true;
          driver.opts.udid = udid;
          (await driver.getScreenshot()).should.eql(pngFileContent.toString('base64'));

          proxySpy.calledTwice.should.be.true;
          proxySpy.firstCall.args.should.eql(['/screenshot', 'GET']);
          proxySpy.secondCall.args.should.eql(['/orientation', 'GET']);

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
});
