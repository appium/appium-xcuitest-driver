import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {errors} from 'appium/driver.js';

import {describeMissingH264Encoder, explainEncoderError} from '../../../lib/device/media-stream/media-proxy.js';

function mediaProxyError(name: string, message: string): Error {
  return Object.assign(new Error(message), {name});
}

describe('explainEncoderError', function () {
  const noEncoder = mediaProxyError(
    'MediaProxyEncoderUnavailableError',
    'No H.264 encoder is available (libopenh264: OpenH264 is not configured: set MEDIA_PROXY_OPENH264_PATH to its ' +
      "library). Use codec 'mjpeg', or install Cisco's OpenH264 and set MEDIA_PROXY_OPENH264_PATH to the library; " +
      'see https://example.test/docs',
  );

  it('points to the jpeg kind and the OpenH264 steps, keeping the reason', function () {
    const e = explainEncoderError(noEncoder) as Error;
    assert.ok(e instanceof errors.UnsupportedOperationError);
    assert.match(e.message, /^No H\.264 encoder is available \(libopenh264: OpenH264 is not configured/);
    assert.match(e.message, /kind 'jpeg'/);
    assert.match(e.message, /OpenH264 2\.6\.0/);
    assert.match(e.message, /MEDIA_PROXY_OPENH264_PATH/);
    assert.match(e.message, /packages\/media-proxy#software-h264-openh264/);
    assert.doesNotMatch(e.message, /codec 'mjpeg'/);
  });

  it('leaves other errors alone', function () {
    const other = mediaProxyError('MediaProxyEncoderUnavailableError', 'The AAC decoder or encoder is missing');
    assert.equal(explainEncoderError(other), other);
    const option = mediaProxyError('MediaProxyOptionError', 'No H.264 encoder');
    assert.equal(explainEncoderError(option), option);
  });
});

describe('describeMissingH264Encoder', function () {
  it('is undefined when an encoder is available', function () {
    assert.equal(describeMissingH264Encoder({listH264Encoders: () => ['h264_videotoolbox']}), undefined);
  });

  it('says what to do when there is none', function () {
    const message = describeMissingH264Encoder({listH264Encoders: () => []});
    assert.match(message ?? '', /^No H\.264 encoder is available\./);
    assert.match(message ?? '', /kind 'jpeg'/);
    assert.match(message ?? '', /OpenH264 2\.6\.0/);
    assert.match(message ?? '', /packages\/media-proxy#software-h264-openh264/);
  });
});
