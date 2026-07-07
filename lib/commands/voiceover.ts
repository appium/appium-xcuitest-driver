import {errors} from 'appium/driver';

import type {XCUITestDriver} from '../driver';
import {isIos27OrNewer} from '../utils';

export interface VoiceOverSpeechResult {
  utterance: string | null;
}

export interface VoiceOverEnabledResult {
  enabled: boolean;
}

/**
 * Enables VoiceOver on the device under test.
 *
 * @since iOS/tvOS 27
 */
export async function mobileEnableVoiceOver(this: XCUITestDriver): Promise<void> {
  requireIos27VoiceOver(this, 'mobile: enableVoiceOver');
  await this.proxyCommand('/wda/voiceOver/enable', 'POST');
}

/**
 * Disables VoiceOver on the device under test.
 *
 * @since iOS/tvOS 27
 */
export async function mobileDisableVoiceOver(this: XCUITestDriver): Promise<void> {
  requireIos27VoiceOver(this, 'mobile: disableVoiceOver');
  await this.proxyCommand('/wda/voiceOver/disable', 'POST');
}

/**
 * Returns whether VoiceOver is currently enabled.
 *
 * @since iOS/tvOS 27
 */
export async function mobileIsVoiceOverEnabled(
  this: XCUITestDriver,
): Promise<VoiceOverEnabledResult> {
  requireIos27VoiceOver(this, 'mobile: isVoiceOverEnabled');
  return await this.proxyCommand<any, VoiceOverEnabledResult>('/wda/voiceOver/enabled', 'GET');
}

/**
 * Moves VoiceOver focus in the given direction.
 *
 * @since iOS/tvOS 27
 * @param direction - One of `forward`, `backward`, `in` (iOS only), or `out` (iOS only).
 * @returns The utterance spoken after the move, or `null`.
 */
export async function mobileVoiceOverMove(
  this: XCUITestDriver,
  direction: string,
): Promise<VoiceOverSpeechResult> {
  requireIos27VoiceOver(this, 'mobile: voiceOverMove');
  return await this.proxyCommand<{direction: string}, VoiceOverSpeechResult>(
    '/wda/voiceOver/move',
    'POST',
    {direction},
  );
}

/**
 * Returns the current VoiceOver utterance without moving focus.
 *
 * @since iOS/tvOS 27
 */
export async function mobileVoiceOverCurrentSpeech(
  this: XCUITestDriver,
): Promise<VoiceOverSpeechResult> {
  requireIos27VoiceOver(this, 'mobile: voiceOverCurrentSpeech');
  return await this.proxyCommand<any, VoiceOverSpeechResult>('/wda/voiceOver/currentSpeech', 'GET');
}

function requireIos27VoiceOver(driver: XCUITestDriver, script: string): void {
  if (!isIos27OrNewer(driver.opts)) {
    throw new errors.InvalidArgumentError(
      `${script} requires iOS/tvOS 27 or newer. ` +
        `The current platformVersion is '${driver.opts.platformVersion ?? 'unknown'}'.`,
    );
  }
}
