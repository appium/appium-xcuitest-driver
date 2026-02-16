import _ from 'lodash';
import {DeviceConnectionsFactory} from '../../lib/device/device-connections-factory';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('DeviceConnectionsFactory', function () {
  let devConFactory;

  beforeEach(function () {
    devConFactory = new DeviceConnectionsFactory();
  });

  afterEach(function () {
    devConFactory = null;
  });

  it('should properly transform udid/part pairs to keys', function () {
    expect(devConFactory._toKey('udid', 1234)).to.eql('udid:1234');
    expect(devConFactory._toKey('udid', 0)).to.eql('udid:0');
    expect(devConFactory._toKey('udid')).to.eql('udid:');
    expect(devConFactory._toKey(null, 456)).to.eql(':456');
    expect(devConFactory._toKey()).to.eql(':');
  });

  it('should properly list connections by udid/port', function () {
    devConFactory._connectionsMapping = {
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

  it('should properly release proxied connections', function () {
    devConFactory._connectionsMapping = {
      'udid:1234': {iproxy: {stop: () => {}}},
      'udid:5678': {},
      'udid4:6545': {iproxy: {stop: () => {}}},
    };

    expect(
      devConFactory._releaseProxiedConnections(_.keys(devConFactory._connectionsMapping)),
    ).to.eql(['udid:1234', 'udid4:6545']);
  });
});
