import {describe, it, beforeEach, afterEach} from 'node:test';

import {errors} from 'appium/driver';
import chai, {expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

import {XCUITestDriver} from '../../../lib/driver';

chai.use(chaiAsPromised);

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

      expect(proxySpy.calledOnceWithExactly('/wda/voiceOver/enable', 'POST')).to.be.true;
    });

    it('mobileDisableVoiceOver should proxy POST /wda/voiceOver/disable', async function () {
      proxySpy.withArgs('/wda/voiceOver/disable', 'POST').resolves();

      await driver.mobileDisableVoiceOver();

      expect(proxySpy.calledOnceWithExactly('/wda/voiceOver/disable', 'POST')).to.be.true;
    });

    it('mobileIsVoiceOverEnabled should proxy GET /wda/voiceOver/enabled', async function () {
      proxySpy.withArgs('/wda/voiceOver/enabled', 'GET').resolves({enabled: true});

      const result = await driver.mobileIsVoiceOverEnabled();

      expect(proxySpy.calledOnceWithExactly('/wda/voiceOver/enabled', 'GET')).to.be.true;
      expect(result).to.eql({enabled: true});
    });

    it('mobileVoiceOverMove should proxy direction as-is to WDA', async function () {
      proxySpy.withArgs('/wda/voiceOver/move', 'POST', {direction: 'forward'}).resolves({utterance: 'Button'});

      const result = await driver.mobileVoiceOverMove('forward');

      expect(proxySpy.calledOnceWithExactly('/wda/voiceOver/move', 'POST', {direction: 'forward'})).to.be.true;
      expect(result).to.eql({utterance: 'Button'});
    });

    it('mobileVoiceOverCurrentSpeech should proxy GET /wda/voiceOver/currentSpeech', async function () {
      proxySpy.withArgs('/wda/voiceOver/currentSpeech', 'GET').resolves({utterance: 'Current item'});

      const result = await driver.mobileVoiceOverCurrentSpeech();

      expect(proxySpy.calledOnceWithExactly('/wda/voiceOver/currentSpeech', 'GET')).to.be.true;
      expect(result).to.eql({utterance: 'Current item'});
    });
  });

  describe('with platformVersion 26.0', function () {
    beforeEach(function () {
      driver.opts.platformVersion = '26.0';
    });

    const versionGateMessage = /requires iOS\/tvOS 27 or newer.*The current platformVersion is '26\.0'/;

    it('mobileEnableVoiceOver should reject without proxying', async function () {
      await expect(driver.mobileEnableVoiceOver()).to.be.rejectedWith(errors.InvalidArgumentError, versionGateMessage);
      expect(proxySpy.called).to.be.false;
    });

    it('mobileDisableVoiceOver should reject without proxying', async function () {
      await expect(driver.mobileDisableVoiceOver()).to.be.rejectedWith(errors.InvalidArgumentError, versionGateMessage);
      expect(proxySpy.called).to.be.false;
    });

    it('mobileIsVoiceOverEnabled should reject without proxying', async function () {
      await expect(driver.mobileIsVoiceOverEnabled()).to.be.rejectedWith(
        errors.InvalidArgumentError,
        versionGateMessage,
      );
      expect(proxySpy.called).to.be.false;
    });

    it('mobileVoiceOverMove should reject without proxying', async function () {
      await expect(driver.mobileVoiceOverMove('forward')).to.be.rejectedWith(
        errors.InvalidArgumentError,
        versionGateMessage,
      );
      expect(proxySpy.called).to.be.false;
    });

    it('mobileVoiceOverCurrentSpeech should reject without proxying', async function () {
      await expect(driver.mobileVoiceOverCurrentSpeech()).to.be.rejectedWith(
        errors.InvalidArgumentError,
        versionGateMessage,
      );
      expect(proxySpy.called).to.be.false;
    });
  });
});
