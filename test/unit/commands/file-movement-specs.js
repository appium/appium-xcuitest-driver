import { getAvailableBundleIds, parseContainerPath, isDocuments } from '../../../lib/commands/file-movement';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as teen_process from 'teen_process';
import { withMocks } from 'appium-test-support';
import { fs, tempDir } from 'appium-support';

chai.should();
chai.use(chaiAsPromised);

describe('file-movement', function () {
  describe('parseContainerPath', function () {
    it('should parse', async function () {
      const mntRoot = await tempDir.openDir();
      const [bundleId, pathInContainer] = await parseContainerPath('@io.appium.example/Documents/file.txt', mntRoot);

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(`${mntRoot}/Documents/file.txt`);
    });
  });

  describe('isDocuments', function () {
    it('should true', function () {
      isDocuments('@io.appium.example/Documents/file.txt').should.be.true;
    });
    it('should true but only documents', function () {
      isDocuments('@io.appium.example/Documents').should.be.true;
    });
    it('should false', function () {
      isDocuments('@io.appium.example/Photo/photo.png').should.be.false;
    });
  });


  describe('getAvailableBundleIds', withMocks({teen_process, fs}, (mocks) => {
    afterEach(function () {
      mocks.verify();
    });

    it('get available bundleIds with items', async function () {
      mocks.fs.expects('which')
        .withExactArgs('ifuse').once().returns(true);
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .returns({stdout: `
com.apple.Keynote, "6383", "Keynote"
io.appium.example, "1.0.205581.0.10", "Appium"
        `, stderr: ''});
      await getAvailableBundleIds({ udid: '12345' }).should.eventually.eql([
        'com.apple.Keynote', 'io.appium.example'
      ]);
    });
    it('get available bundleIds without items', async function () {
      mocks.fs.expects('which')
        .withExactArgs('ifuse').once().returns(true);
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .returns({stdout: '', stderr: ''});
      await getAvailableBundleIds({ udid: '12345' }).should.eventually.eql([]);
    });
    it('raises no ifuse error', async function () {
      mocks.fs.expects('which')
        .withExactArgs('ifuse').once().returns(false);
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .returns({stdout: '', stderr: ''});
      await getAvailableBundleIds({ udid: '12345' })
        .should.eventually.be.rejectedWith(/tool is required/);
    });
    it('raises no ifuse error', async function () {
      mocks.fs.expects('which')
        .withExactArgs('ifuse').once().returns(true);
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .throws();
      await getAvailableBundleIds({ udid: '12345' })
        .should.eventually.rejectedWith(/Cannot get a list of bundleIds/);
    });
  }));
});
