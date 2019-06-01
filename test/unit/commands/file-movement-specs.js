import { getAvailableBundleIds, parseContainerPath, isDocuments } from '../../../lib/commands/file-movement';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as teen_process from 'teen_process';
import { withMocks } from 'appium-test-support';
import { fs, tempDir } from 'appium-support';

const should = chai.should();
chai.use(chaiAsPromised);

describe('file-movement', function () {
  describe('parseContainerPath', function () {
    it('should parse with container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath('@io.appium.example:app/Documents/file.txt', mntRoot);

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(`${mntRoot}/Documents/file.txt`);
      containerType.should.eql('app');
    });
    it('should parse without container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath('@io.appium.example/Documents/file.txt', mntRoot);

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(`${mntRoot}/Documents/file.txt`);
      should.equal(containerType, null);
    });
  });

  describe('isDocuments', function () {
    it('should true', function () {
      isDocuments('documents').should.be.true;
    });
    it('should true with upper', function () {
      isDocuments('DOCUMENTS').should.be.true;
    });
    it('should false with non documents', function () {
      isDocuments('app').should.be.false;
    });
    it('should false with null', function () {
      isDocuments(null).should.be.false;
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
    it('should nothing happen', async function () {
      mocks.fs.expects('which')
        .withExactArgs('ifuse').once().returns(true);
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .throws();
      await getAvailableBundleIds({ udid: '12345' })
        .should.eventually.be.undefined;
    });
  }));
});
