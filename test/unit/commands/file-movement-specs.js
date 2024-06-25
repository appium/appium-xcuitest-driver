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

      // @ts-ignore should raises type error
      bundleId.should.eql('io.appium.example');
      // @ts-ignore should raises type error
      pathInContainer.should.eql(`${mntRoot}/Documents/file.txt`);
      // @ts-ignore should raises type error
      containerType.should.eql('app');
    });
    it('should parse with container root', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath(
        '@io.appium.example:documents/',
        mntRoot,
      );

      // @ts-ignore should raises type error
      bundleId.should.eql('io.appium.example');
      // @ts-ignore should raises type error
      pathInContainer.should.eql(mntRoot);
      // @ts-ignore should raises type error
      containerType.should.eql('documents');
    });
    it('should parse without container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath(
        '@io.appium.example/Documents/file.txt',
        mntRoot,
      );

      // @ts-ignore should raises type error
      bundleId.should.eql('io.appium.example');
      // @ts-ignore should raises type error
      pathInContainer.should.eql(`${mntRoot}/Documents/file.txt`);
      // @ts-ignore should raises type error
      expect(containerType).equal(null);
    });
    it('should raise an error if no container path', async function () {
      const mntRoot = await tempDir.openDir();
      // @ts-ignore should raises type error
      await parseContainerPath('@io.appium.example:documents', mntRoot).should.be.rejected;
    });
  });
});
