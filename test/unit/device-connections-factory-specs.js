import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import _ from 'lodash';
import { DeviceConnectionsFactory } from '../../lib/device-connections-factory';


chai.should();
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
    devConFactory._toKey('udid', 1234).should.eql('udid:1234');
    devConFactory._toKey('udid', 0).should.eql('udid:0');
    devConFactory._toKey('udid').should.eql('udid:');
    devConFactory._toKey(null, 456).should.eql(':456');
    devConFactory._toKey().should.eql(':');
  });

  it('should properly list connections by udid/port', function () {
    devConFactory._connectionsMapping = {
      'udid:1234': {},
      'udid2:5678': {},
      'udid4:5678': {},
      'udid:8765': {},
      'udid5:9876': {},
    };
    devConFactory.listConnections('udid', 1234).should.eql(['udid:1234', 'udid:8765']);
    devConFactory.listConnections('udid', 1234, true).should.eql(['udid:1234']);
    devConFactory.listConnections('udid', null, true).should.eql(['udid:1234', 'udid:8765']);
    devConFactory.listConnections('udid2').should.eql(['udid2:5678']);
    devConFactory.listConnections(null, 5678).should.eql(['udid2:5678', 'udid4:5678']);
    devConFactory.listConnections(null, 9876).should.eql(['udid5:9876']);
    devConFactory.listConnections(null, 9876, true).should.eql(['udid5:9876']);
    devConFactory.listConnections().should.eql([]);
    devConFactory.listConnections('asd').should.eql([]);
    devConFactory.listConnections('asd', 23424).should.eql([]);
    devConFactory.listConnections(null, 23424).should.eql([]);
  });

  it('should properly release proxied connections', function () {
    devConFactory._connectionsMapping = {
      'udid:1234': {iproxy: {stop: () => {}}},
      'udid:5678': {},
      'udid4:6545': {iproxy: {stop: () => {}}},
    };

    devConFactory._releaseProxiedConnections(_.keys(devConFactory._connectionsMapping))
      .should.eql(['udid:1234', 'udid4:6545']);
  });

});
