import _ from 'lodash';
import {logger} from 'appium/support';
import {DeviceConnectionsFactory} from '../../lib/device/device-connections-factory';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('DeviceConnectionsFactory', function () {
  let devConFactory: DeviceConnectionsFactory;

  beforeEach(function () {
    devConFactory = new DeviceConnectionsFactory(logger.getLogger('DevCon Factory test'));
    (DeviceConnectionsFactory as any)._connectionsMapping = {};
  });

  it('should properly transform udid/part pairs to keys', function () {
    const f = devConFactory as any;
    expect(f._toKey('udid', 1234)).to.eql('udid:1234');
    expect(f._toKey('udid', 0)).to.eql('udid:0');
    expect(f._toKey('udid')).to.eql('udid:');
    expect(f._toKey(null, 456)).to.eql(':456');
    expect(f._toKey()).to.eql(':');
  });

  it('should properly list connections by udid/port', function () {
    (DeviceConnectionsFactory as any)._connectionsMapping = {
      'udid:1234': {},
      'udid2:5678': {},
      'udid4:5678': {},
      'udid:8765': {},
      'udid5:9876': {},
    };
    expect(devConFactory.listConnections('udid', 1234)).to.eql(['udid:1234', 'udid:8765']);
    expect(devConFactory.listConnections('udid', 1234, true)).to.eql(['udid:1234']);
    expect(devConFactory.listConnections('udid', null, true)).to.eql(['udid:1234', 'udid:8765']);
    expect(devConFactory.listConnections('udid2')).to.eql(['udid2:5678']);
    expect(devConFactory.listConnections(null, 5678)).to.eql(['udid2:5678', 'udid4:5678']);
    expect(devConFactory.listConnections(null, 9876)).to.eql(['udid5:9876']);
    expect(devConFactory.listConnections(null, 9876, true)).to.eql(['udid5:9876']);
    expect(devConFactory.listConnections()).to.eql([]);
    expect(devConFactory.listConnections('asd')).to.eql([]);
    expect(devConFactory.listConnections('asd', 23424)).to.eql([]);
    expect(devConFactory.listConnections(null, 23424)).to.eql([]);
  });

  it('should properly release proxied connections', async function () {
    (DeviceConnectionsFactory as any)._connectionsMapping = {
      'udid:1234': {portForwarder: {stop: () => {}}},
      'udid:5678': {},
      'udid4:6545': {portForwarder: {stop: () => {}}},
    };

    const f = devConFactory as any;
    expect(
      await f._releaseProxiedConnections(
        _.keys((DeviceConnectionsFactory as any)._connectionsMapping),
      ),
    ).to.eql(['udid:1234', 'udid4:6545']);
  });
});
