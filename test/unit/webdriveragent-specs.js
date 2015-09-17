import WebDriverAgent from '../../lib/webdriveragent';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.should();
chai.use(chaiAsPromised);

describe('WebDriverAgent', () => {
  it('should require all parameters', () => {
    (() => {
      new WebDriverAgent();
    }).should.throw(/must send in the 'udid'/);
  });
});
