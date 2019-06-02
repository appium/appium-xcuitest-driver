import { getAvailableBundleIds, parseContainerPath } from '../../../lib/commands/file-movement';
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
    it('should parse with container root', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath('@io.appium.example:documents/', mntRoot);

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(mntRoot);
      containerType.should.eql('documents');
    });
    it('should parse without container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath('@io.appium.example/Documents/file.txt', mntRoot);

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(`${mntRoot}/Documents/file.txt`);
      should.equal(containerType, null);
    });
    it('should raise an error if no container path', async function () {
      const mntRoot = await tempDir.openDir();
      await parseContainerPath('@io.appium.example:documents', mntRoot).should.eventually.be.rejected;
    });
  });

  describe('getAvailableBundleIds', withMocks({teen_process, fs}, (mocks) => {
    afterEach(function () {
      mocks.verify();
    });

    it('get available bundleIds with items', async function () {
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .returns({stdout: `
com.apple.Keynote, "6383", "Keynote"
io.appium.example, "1.0.205581.0.10", "Appium"
        `, stderr: ''});
      await getAvailableBundleIds('12345').should.eventually.eql([
        'com.apple.Keynote', 'io.appium.example'
      ]);
    });
    it('get available bundleIds without items', async function () {
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .returns({stdout: '', stderr: ''});
      await getAvailableBundleIds('12345').should.eventually.eql([]);
    });
    it('should nothing happen', async function () {
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .throws();
      await getAvailableBundleIds('12345')
        .should.eventually.be.eql([]);
    });
  }));
});
