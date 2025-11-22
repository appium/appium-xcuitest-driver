import {parseCommonName} from '../../../lib/commands/certificate';
import {expect} from 'chai';


describe('ssl certificate parser command', function () {
  const sslOutputLibreSSL = 'subject= /C=US/ST=California/L=San Francisco/O=BadSSL/CN=*.badssl.com';
  const sslOutputOpenSSL =
    'subject=C = US, ST = California, L = San Francisco, O = BadSSL, CN = *.badssl.com';
  const expectedString = '*.badssl.com';

  it('try to parse LibreSSL command output', function () {
    expect(parseCommonName(sslOutputLibreSSL)).to.eql(expectedString);
  });

  it('try to parse OpenSSL command output', function () {
    expect(parseCommonName(sslOutputOpenSSL)).to.eql(expectedString);
  });
});
