import { checkForDependencies } from '../../lib/wda/utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as teen_process from 'teen_process';
import { withMocks } from 'appium-test-support';
import { fs } from 'appium-support';


chai.should();
chai.use(chaiAsPromised);

const bootstrapPath = '/path/to/wda';

describe('webdriveragent utils', function () {
  describe('checkForDependencies', withMocks({teen_process, fs}, (mocks) => {
    afterEach(function () {
      mocks.verify();
    });
    it('should run script with -d argument in correct directory', async function () {
      mocks.fs.expects('which').once().returns(true);
      mocks.fs.expects('hasAccess').thrice()
        .onFirstCall().returns(false)
        .onSecondCall().returns(true)
        .onThirdCall().returns(true);
      mocks.teen_process.expects("exec")
        .once().withExactArgs('Scripts/bootstrap.sh', ['-d'], {cwd: '/path/to/wda'})
        .returns('');
      await checkForDependencies(bootstrapPath);
    });
    it('should run script with -D argument when SSL requested', async function () {
      mocks.fs.expects('which').once().returns(true);
      mocks.fs.expects('hasAccess').thrice()
        .onFirstCall().returns(false)
        .onSecondCall().returns(true)
        .onThirdCall().returns(true);
      mocks.teen_process.expects("exec")
        .once().withExactArgs('Scripts/bootstrap.sh', ['-d', '-D'], {cwd: '/path/to/wda'})
        .returns('');
      await checkForDependencies(bootstrapPath, true);
    });
    it('should not run script if Carthage directory already present', async function () {
      mocks.fs.expects('which').once().returns(true);
      mocks.fs.expects('hasAccess').thrice()
        .onFirstCall().returns(true)
        .onSecondCall().returns(true)
        .onThirdCall().returns(true);
      mocks.teen_process.expects("exec").never();
      await checkForDependencies(bootstrapPath);
    });
    it('should delete Carthage folder and throw error on script error', async function () {
      mocks.fs.expects('which').once().returns(true);
      mocks.fs.expects('hasAccess').once()
        .onFirstCall().returns(false);
      mocks.teen_process.expects("exec")
        .once().withExactArgs('Scripts/bootstrap.sh', ['-d'], {cwd: '/path/to/wda'})
        .throws({stdout: '', stderr: '', message: 'Bootstrap script failure'});
      await checkForDependencies(bootstrapPath).should.eventually.be.rejectedWith(/Bootstrap script failure/);
    });
    it('should create Resources folder if not already there', async function () {
      mocks.fs.expects('which').once().returns(true);
      mocks.fs.expects('hasAccess').thrice()
        .onFirstCall().returns(true)
        .onSecondCall().returns(false)
        .onThirdCall().returns(true);
      mocks.fs.expects('mkdir')
        .withExactArgs(`${bootstrapPath}/Resources`);
      mocks.teen_process.expects("exec").never();
      await checkForDependencies(bootstrapPath);
    });
    it('should create WDA bundle if not already there', async function () {
      mocks.fs.expects('which').once().returns(true);
      mocks.fs.expects('hasAccess').thrice()
        .onFirstCall().returns(true)
        .onSecondCall().returns(true)
        .onThirdCall().returns(false);
      mocks.fs.expects('mkdir')
        .withExactArgs(`${bootstrapPath}/Resources/WebDriverAgent.bundle`);
      mocks.teen_process.expects("exec").never();
      await checkForDependencies(bootstrapPath);
    });
  }));
});
