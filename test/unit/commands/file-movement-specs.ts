import {parseContainerPath} from '../../../lib/commands/file-movement';
import {tempDir} from 'appium/support';
import {XCUITestDriver} from '../../../lib/driver';


describe('file-movement', function () {
  let chai;
  let expect;

  before(async function () {
    chai = await import('chai');
    const chaiAsPromised = await import('chai-as-promised');

    chai.use(chaiAsPromised.default);
    expect = chai.expect;
  });

  describe('parseContainerPath', function () {
    let driver;

    beforeEach(function () {
      driver = new XCUITestDriver();
    });

    afterEach(function () {
      driver = null;
    });

    it('should parse with container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath.bind(driver)(
        '@io.appium.example:app/Documents/file.txt',
        mntRoot,
      );

      expect(bundleId).to.eql('io.appium.example');
      expect(pathInContainer).to.eql(`${mntRoot}/Documents/file.txt`);
      expect(containerType).to.eql('app');
    });
    it('should parse with container root', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath.bind(driver)(
        '@io.appium.example:documents/',
        mntRoot,
      );

      expect(bundleId).to.eql('io.appium.example');
      expect(pathInContainer).to.eql(mntRoot);
      expect(containerType).to.eql('documents');
    });
    it('should parse without container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath.bind(driver)(
        '@io.appium.example/Documents/file.txt',
        mntRoot,
      );

      expect(bundleId).to.eql('io.appium.example');
      expect(pathInContainer).to.eql(`${mntRoot}/Documents/file.txt`);
      expect(containerType).equal(null);
    });
    it('should raise an error if no container path', async function () {
      const mntRoot = await tempDir.openDir();
      await expect(parseContainerPath.bind(driver)('@io.appium.example:documents', mntRoot)).to.be.rejected;
    });
  });
});
