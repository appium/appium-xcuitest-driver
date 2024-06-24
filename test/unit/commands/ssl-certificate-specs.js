import {parseCommonName} from '../../../lib/commands/certificate';


describe('ssl certificate parser command', function () {
  const sslOutputLibreSSL = 'subject= /C=US/ST=California/L=San Francisco/O=BadSSL/CN=*.badssl.com';
  const sslOutputOpenSSL =
    'subject=C = US, ST = California, L = San Francisco, O = BadSSL, CN = *.badssl.com';
  const expectedString = '*.badssl.com';

  let chai;

  before(async function () {
    chai = await import('chai');
    chai.should();
  });

  it('try to parse LibreSSL command output', function () {
    // @ts-ignore should raises type error
    parseCommonName(sslOutputLibreSSL).should.eql(expectedString);
  });

  it('try to parse OpenSSL command output', function () {
    // @ts-ignore should raises type error
    parseCommonName(sslOutputOpenSSL).should.eql(expectedString);
  });
});
