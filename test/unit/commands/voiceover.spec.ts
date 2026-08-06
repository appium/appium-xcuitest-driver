import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver.js';

describe('voiceover commands', function () {
  let driver: XCUITestDriver;
  let proxySpy: sinon.SinonStub;

  beforeEach(function () {
    driver = new XCUITestDriver({} as any);
    proxySpy = sinon.stub(driver, 'proxyCommand');
  });

  afterEach(function () {
    proxySpy.restore();
  });

  describe('with platformVersion 27.0', function () {
    beforeEach(function () {
      driver.opts.platformVersion = '27.0';
    });

    it('mobileEnableVoiceOver should proxy POST /wda/voiceOver/enable', async function () {
      proxySpy.withArgs('/wda/voiceOver/enable', 'POST').resolves();

      await driver.mobileEnableVoiceOver();

      assert.strictEqual(proxySpy.calledOnceWithExactly('/wda/voiceOver/enable', 'POST'), true);
    });

    it('mobileDisableVoiceOver should proxy POST /wda/voiceOver/disable', async function () {
      proxySpy.withArgs('/wda/voiceOver/disable', 'POST').resolves();

      await driver.mobileDisableVoiceOver();

      assert.strictEqual(proxySpy.calledOnceWithExactly('/wda/voiceOver/disable', 'POST'), true);
    });

    it('mobileIsVoiceOverEnabled should proxy GET /wda/voiceOver/enabled', async function () {
      proxySpy.withArgs('/wda/voiceOver/enabled', 'GET').resolves({enabled: true});

      const result = await driver.mobileIsVoiceOverEnabled();

      assert.strictEqual(proxySpy.calledOnceWithExactly('/wda/voiceOver/enabled', 'GET'), true);
      assert.deepStrictEqual(result, {enabled: true});
    });

    it('mobileVoiceOverMove should proxy direction as-is to WDA', async function () {
      proxySpy.withArgs('/wda/voiceOver/move', 'POST', {direction: 'forward'}).resolves({utterance: 'Button'});

      const result = await driver.mobileVoiceOverMove('forward');

      assert.strictEqual(proxySpy.calledOnceWithExactly('/wda/voiceOver/move', 'POST', {direction: 'forward'}), true);
      assert.deepStrictEqual(result, {utterance: 'Button'});
    });

    it('mobileVoiceOverCurrentSpeech should proxy GET /wda/voiceOver/currentSpeech', async function () {
      proxySpy.withArgs('/wda/voiceOver/currentSpeech', 'GET').resolves({utterance: 'Current item'});

      const result = await driver.mobileVoiceOverCurrentSpeech();

      assert.strictEqual(proxySpy.calledOnceWithExactly('/wda/voiceOver/currentSpeech', 'GET'), true);
      assert.deepStrictEqual(result, {utterance: 'Current item'});
    });
  });

  describe('with platformVersion 26.0', function () {
    beforeEach(function () {
      driver.opts.platformVersion = '26.0';
    });

    const versionGateMessage = /requires iOS\/tvOS 27 or newer.*The current platformVersion is '26\.0'/;

    it('mobileEnableVoiceOver should reject without proxying', async function () {
      await assert.rejects(driver.mobileEnableVoiceOver(), {
        name: 'InvalidArgumentError',
        message: versionGateMessage,
      });
      assert.strictEqual(proxySpy.called, false);
    });

    it('mobileDisableVoiceOver should reject without proxying', async function () {
      await assert.rejects(driver.mobileDisableVoiceOver(), {
        name: 'InvalidArgumentError',
        message: versionGateMessage,
      });
      assert.strictEqual(proxySpy.called, false);
    });

    it('mobileIsVoiceOverEnabled should reject without proxying', async function () {
      await assert.rejects(driver.mobileIsVoiceOverEnabled(), {
        name: 'InvalidArgumentError',
        message: versionGateMessage,
      });
      assert.strictEqual(proxySpy.called, false);
    });

    it('mobileVoiceOverMove should reject without proxying', async function () {
      await assert.rejects(driver.mobileVoiceOverMove('forward'), {
        name: 'InvalidArgumentError',
        message: versionGateMessage,
      });
      assert.strictEqual(proxySpy.called, false);
    });

    it('mobileVoiceOverCurrentSpeech should reject without proxying', async function () {
      await assert.rejects(driver.mobileVoiceOverCurrentSpeech(), {
        name: 'InvalidArgumentError',
        message: versionGateMessage,
      });
      assert.strictEqual(proxySpy.called, false);
    });
  });
});
