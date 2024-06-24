import {parseContainerPath} from '../../../lib/commands/file-movement';
import {tempDir} from 'appium/support';


describe('file-movement', function () {
  let chai;
  let expect;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.should();
    chai.use(chaiAsPromised.default);

    expect = chai.expect;
  });

  describe('parseContainerPath', function () {
    it('should parse with container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath(
        '@io.appium.example:app/Documents/file.txt',
        mntRoot,
      );

      expect(bundleId).to.eql('io.appium.example');
      expect(pathInContainer).to.eql(`${mntRoot}/Documents/file.txt`);
      expect(/** @type {string} */ (containerType)).to.eql('app');
    });
    it('should parse with container root', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath(
        '@io.appium.example:documents/',
        mntRoot,
      );

      expect(bundleId).to.eql('io.appium.example');
      expect(pathInContainer).to.eql(mntRoot);
      expect(/** @type {string} */ (containerType)).to.eql('documents');
    });
    it('should parse without container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath(
        '@io.appium.example/Documents/file.txt',
        mntRoot,
      );

      expect(bundleId).to.eql('io.appium.example');
      expect(pathInContainer).to.eql(`${mntRoot}/Documents/file.txt`);
      expect(containerType).to.equal(null);
    });
    it('should raise an error if no container path', async function () {
      const mntRoot = await tempDir.openDir();
      expect(parseContainerPath('@io.appium.example:documents', mntRoot)).to.eventually.be.rejected;
    });
  });
});
