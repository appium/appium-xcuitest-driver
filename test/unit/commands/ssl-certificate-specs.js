import {parseCommonName} from '../../../lib/commands/certificate';


describe('ssl certificate parser command', function () {
  const sslOutputLibreSSL = 'subject= /C=US/ST=California/L=San Francisco/O=BadSSL/CN=*.badssl.com';
  const sslOutputOpenSSL =
    'subject=C = US, ST = California, L = San Francisco, O = BadSSL, CN = *.badssl.com';
  const expectedString = '*.badssl.com';

  let chai;
  let expect;

  before(async function () {
    chai = await import('chai');
    expect = chai.expect;
  });

  it('try to parse LibreSSL command output', function () {
    expect(parseCommonName(sslOutputLibreSSL)).to.eql(expectedString);
  });

  it('try to parse OpenSSL command output', function () {
    expect(parseCommonName(sslOutputOpenSSL)).to.eql(expectedString);
  });
});
