import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {parseCommonName} from '../../../lib/commands/certificate.js';

describe('ssl certificate parser command', function () {
  const sslOutputLibreSSL = 'subject= /C=US/ST=California/L=San Francisco/O=BadSSL/CN=*.badssl.com';
  const sslOutputOpenSSL = 'subject=C = US, ST = California, L = San Francisco, O = BadSSL, CN = *.badssl.com';
  const expectedString = '*.badssl.com';

  it('try to parse LibreSSL command output', function () {
    assert.strictEqual(parseCommonName(sslOutputLibreSSL), expectedString);
  });

  it('try to parse OpenSSL command output', function () {
    assert.strictEqual(parseCommonName(sslOutputOpenSSL), expectedString);
  });
});
