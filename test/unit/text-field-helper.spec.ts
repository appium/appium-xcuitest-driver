import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {stub} from 'sinon';
import type {Browser} from 'webdriverio';

import {focusTextField} from '../functional/helpers/text-field.js';

const SELECTOR = '-ios class chain:**/XCUIElementTypeTextField[2]';
const field = () => ({waitForDisplayed: stub().resolves(), click: stub().resolves()});

describe('text field focus helper', function () {
  it('re-resolves and taps the field after the keyboard fails to appear', async function () {
    const first = field();
    const second = field();
    const $ = stub();
    $.onCall(0).resolves(first);
    $.onCall(1).resolves(second);
    const isKeyboardShown = stub();
    isKeyboardShown.onCall(0).resolves(false);
    isKeyboardShown.onCall(1).resolves(true);
    const waitUntil = async (condition: () => Promise<boolean>, options: {interval: number}) => {
      assert.equal(options.interval, 500);
      if (!(await condition())) {
        throw new Error('Keyboard did not appear');
      }
    };
    const result = await focusTextField({$, isKeyboardShown, waitUntil} as unknown as Browser, SELECTOR, 3, 0);
    assert.equal(result, second);
    assert.deepEqual($.args, [[SELECTOR], [SELECTOR]]);
    assert.equal(first.click.callCount, 1);
    assert.equal(second.click.callCount, 1);
  });

  it('does not tap again when the keyboard is ready', async function () {
    const target = field();
    const $ = stub().resolves(target);
    const waitUntil = stub().resolves();
    assert.equal(await focusTextField({$, waitUntil} as unknown as Browser, SELECTOR, 3, 0), target);
    assert.equal($.callCount, 1);
    assert.equal(target.click.callCount, 1);
  });

  it('recovers from a stale element by finding it again', async function () {
    const stale = field();
    stale.click.rejects(new Error('stale element reference'));
    const current = field();
    const $ = stub();
    $.onCall(0).resolves(stale);
    $.onCall(1).resolves(current);
    const waitUntil = stub().resolves();
    assert.equal(await focusTextField({$, waitUntil} as unknown as Browser, SELECTOR, 3, 0), current);
    assert.equal(waitUntil.callCount, 1);
  });

  it('keeps a persistent keyboard failure after the retry limit', async function () {
    const target = field();
    const $ = stub().resolves(target);
    const error = new Error('Keyboard did not appear');
    const waitUntil = stub().rejects(error);
    await assert.rejects(focusTextField({$, waitUntil} as unknown as Browser, SELECTOR, 3, 0), error);
    assert.equal(target.click.callCount, 3);
  });
});
