import _ from 'lodash';
import {assertSimulator as _assertSimulator} from '../utils';

const assertSimulator = _.partial(_assertSimulator, 'Keychain modification');

export default {
  /**
   * Clears keychains on a simulated device.
   *
   * @throws {Error} If current device is not a Simulator or there was an error
   * while clearing keychains.
   * @this {import('../driver').XCUITestDriver}
   * @group Simulator Only
   */
  async mobileClearKeychains() {
    assertSimulator(this);
    // @ts-expect-error - do not assign arbitrary properties to `this.opts`
    await this.opts.device.clearKeychains();
  },
};
