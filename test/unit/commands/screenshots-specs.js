import sinon from 'sinon';
import XCUITestDriver from '../../..';
import { fs, tempDir } from 'appium-support';

const simctlModule = require('node-simctl');
const teenProcessModule = require('teen_process');

describe('screenshots commands', function () {
  let driver;
  let proxyStub;

  const base64Response = 'aGVsbG8=';

  beforeEach(function () {
    driver = new XCUITestDriver();
    proxyStub = sinon.stub(driver, 'proxyCommand');
  });
  afterEach(function () {
    proxyStub.reset();
  });

  describe('getScreenshot', function () {
    describe('simulator', function () {
      let simctlStub = sinon.stub(simctlModule, 'getScreenshot');

      afterEach(function () {
        simctlStub.reset();
      });

      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxyStub.returns(base64Response);
        driver.opts.realDevice = false;

        await driver.getScreenshot();

        proxyStub.calledOnce.should.be.true;
        proxyStub.firstCall.args[0].should.eql('/screenshot');
        proxyStub.firstCall.args[1].should.eql('GET');

        simctlStub.notCalled.should.be.true;
      });

      it('should get a screenshot from simctl if WDA call fails and Xcode version >= 8.1', async function () {
        proxyStub.returns(null);
        simctlStub.returns(base64Response);

        driver.opts.realDevice = false;
        driver.xcodeVersion = {
          versionFloat: 8.3
        };
        const result = await driver.getScreenshot();
        result.should.equal(base64Response);

        proxyStub.calledOnce.should.be.true;
        simctlStub.calledOnce.should.be.true;
      });
    });

    describe('real device', function () {
      it('should get a screenshot from WDA if no errors are detected', async function () {
        proxyStub.returns(base64Response);
        driver.opts.realDevice = true;

        await driver.getScreenshot();

        proxyStub.calledOnce.should.be.true;
        proxyStub.firstCall.args[0].should.eql('/screenshot');
        proxyStub.firstCall.args[1].should.eql('GET');
      });

      describe('idevicescreenshot', function () {
        const tiffPath = '/some/file.tiff';
        const pngPath = '/some/file.png';
        const udid = '1234';
        const toolName = 'idevicescreenshot';
        const pngFileContent = 'blabla';

        let fsExistsStub;
        let fsWhichStub;
        let fsRimRafStub;
        let fsReadFileStub;
        let execStub;
        let pathStub;

        beforeEach(function () {
          driver.opts.realDevice = true;
          driver.opts.udid = udid;
        });
        afterEach(function () {
          for (const stub of [fsExistsStub, fsWhichStub, fsReadFileStub, fsRimRafStub, execStub, pathStub]) {
            if (stub) {
              stub.restore();
            }
          }
        });

        describe('success', function () {
          beforeEach(function () {
            fsExistsStub = sinon.stub(fs, 'exists');
            fsExistsStub.returns(true);

            fsWhichStub = sinon.stub(fs, 'which');
            fsWhichStub.returns(toolName);

            fsRimRafStub = sinon.stub(fs, 'rimraf');

            fsReadFileStub = sinon.stub(fs, 'readFile');
            fsReadFileStub.returns(pngFileContent);

            execStub = sinon.stub(teenProcessModule, 'exec');

            pathStub = sinon.stub(tempDir, 'path');
            pathStub.withArgs({prefix: `screenshot-${udid}`, suffix: '.tiff'}).returns(tiffPath);
            pathStub.withArgs({prefix: `screenshot-${udid}`, suffix: '.png'}).returns(pngPath);
          });
          afterEach(function () {
            fsWhichStub.calledOnce.should.be.true;
            fsWhichStub.firstCall.args[0].should.eql(toolName);

            execStub.calledTwice.should.be.true;
            execStub.firstCall.args[0].should.eql(toolName);
            execStub.firstCall.args[1].should.eql(['-u', udid, tiffPath]);
            execStub.secondCall.args[0].should.eql('sips');
            execStub.secondCall.args[1].should.eql(
              ['-r', '-90', '-s', 'format', 'png', tiffPath, '--out', pngPath]);

            fsRimRafStub.callCount.should.eql(4);

            fsReadFileStub.calledOnce.should.be.true;
            fsReadFileStub.firstCall.args[0].should.eql(pngPath);

            pathStub.calledTwice.should.be.true;
          });

          it('should use idevicescreenshot if WDA fails', async function () {
            proxyStub.onFirstCall().returns(null);
            proxyStub.onSecondCall().returns('LANDSCAPE');

            (await driver.getScreenshot()).should.eql(pngFileContent.toString('base64'));

            proxyStub.callCount.should.eql(2);
            proxyStub.firstCall.args.should.eql(['/screenshot', 'GET']);
            proxyStub.secondCall.args.should.eql(['/orientation', 'GET']);
          });
          it('should use idevicescreenshot if specified in realDeviceScreenshotter cap', async function () {
            proxyStub.onFirstCall().returns('LANDSCAPE');
            driver.opts.realDeviceScreenshotter = 'idevicescreenshot';

            (await driver.getScreenshot()).should.eql(pngFileContent.toString('base64'));

            proxyStub.callCount.should.eql(1);
          });
        });
        describe('failure', function () {
          beforeEach(function () {

            proxyStub.onFirstCall().returns(null);

            fsWhichStub = sinon.stub(fs, 'which');
            fsWhichStub.throws(new Error('No program found'));
          });
          afterEach(function () {
            fsWhichStub.calledOnce.should.be.true;
            fsWhichStub.firstCall.args[0].should.eql(toolName);
          });

          it('should throw an error if idevicescreenshot is not available and realDeviceScreenshotter set', async function () {
            driver.opts.realDeviceScreenshotter = 'idevicescreenshot';
            await driver.getScreenshot().should.eventually.be.rejectedWith(/No 'idevicescreenshot' program found/);
          });
        });
      });
    });
  });
});
