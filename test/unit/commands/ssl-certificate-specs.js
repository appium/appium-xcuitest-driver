import chai from 'chai';
import { parseCommonName } from '../../../lib/commands/certificate';

chai.should();

describe('ssl certificate parser command', function () {
  const sslOutputLibreSSL = 'subject= /C=US/ST=California/L=San Francisco/O=BadSSL/CN=*.badssl.com';
  const sslOutputOpenSSL = 'subject=C = US, ST = California, L = San Francisco, O = BadSSL, CN = *.badssl.com';
  const expectedString = '*.badssl.com';

  it('try to parse LibreSSL command output', function () {
    parseCommonName(sslOutputLibreSSL).should.eql(expectedString);
  });

  it('try to parse OpenSSL command output', function () {
    parseCommonName(sslOutputOpenSSL).should.eql(expectedString);
  });
});
