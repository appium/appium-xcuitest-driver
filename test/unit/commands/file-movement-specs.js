import {parseContainerPath} from '../../../lib/commands/file-movement';
import {tempDir} from 'appium/support';
import {XCUITestDriver} from '../../../lib/driver';


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

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(`${mntRoot}/Documents/file.txt`);
      containerType.should.eql('app');
    });
    it('should parse with container root', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath.bind(driver)(
        '@io.appium.example:documents/',
        mntRoot,
      );

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(mntRoot);
      containerType.should.eql('documents');
    });
    it('should parse without container', async function () {
      const mntRoot = await tempDir.openDir();
      const {bundleId, pathInContainer, containerType} = await parseContainerPath.bind(driver)(
        '@io.appium.example/Documents/file.txt',
        mntRoot,
      );

      bundleId.should.eql('io.appium.example');
      pathInContainer.should.eql(`${mntRoot}/Documents/file.txt`);
      expect(containerType).equal(null);
    });
    it('should raise an error if no container path', async function () {
      const mntRoot = await tempDir.openDir();
      await parseContainerPath.bind(driver)('@io.appium.example:documents', mntRoot).should.be.rejected;
    });
  });
});
