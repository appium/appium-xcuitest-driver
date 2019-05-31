import { getAvailableBundleIds } from '../../../lib/commands/file-movement';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as teen_process from 'teen_process';
import { withMocks } from 'appium-test-support';
import { fs } from 'appium-support';

chai.should();
chai.use(chaiAsPromised);

describe('file-movement', function () {
  describe('getAvailableBundleIds', withMocks({teen_process, fs}, (mocks) => {
    afterEach(function () {
      mocks.verify();
    });

    it('get available bundleIds with items', async function () {
      mocks.fs.expects('which')
        .withExactArgs('ifuse').once().returns(true);
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .returns(`
com.apple.Keynote, "6383", "Keynote"
io.appium.example, "1.0.205581.0.10", "Appium"
        `);
      await getAvailableBundleIds({ udid: '12345' }).should.eventually.eql([
        'com.apple.Keynote', 'io.appium.example'
      ]);
    });
    it('get available bundleIds without items', async function () {
      mocks.fs.expects('which')
        .withExactArgs('ifuse').once().returns(true);
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .returns('');
      await getAvailableBundleIds({ udid: '12345' }).should.eventually.eql([]);
    });
    it('raises no ifuse error', async function () {
      mocks.fs.expects('which')
        .withExactArgs('ifuse').once().returns(false);
      mocks.teen_process.expects('exec')
        .withExactArgs('ifuse', ['-u', '12345', '--list-apps'])
        .returns('');
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
