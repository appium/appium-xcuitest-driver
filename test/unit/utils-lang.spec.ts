import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {assignDefaults, escapeRegExp, isEmpty, memoize, mergeDeep} from '../../lib/utils/index.js';

describe('utils/lang', function () {
  describe('isEmpty', function () {
    it('treats null and undefined as empty', function () {
      assert.strictEqual(isEmpty(null), true);
      assert.strictEqual(isEmpty(undefined), true);
    });

    it('treats empty string, array, Buffer as empty', function () {
      assert.strictEqual(isEmpty(''), true);
      assert.strictEqual(isEmpty([]), true);
      assert.strictEqual(isEmpty(Buffer.alloc(0)), true);
    });

    it('treats non-empty string, array, Buffer as non-empty', function () {
      assert.strictEqual(isEmpty('a'), false);
      assert.strictEqual(isEmpty([0]), false);
      assert.strictEqual(isEmpty(Buffer.from([1])), false);
    });

    it('treats empty Map and Set as empty', function () {
      assert.strictEqual(isEmpty(new Map()), true);
      assert.strictEqual(isEmpty(new Set()), true);
    });

    it('treats populated Map and Set as non-empty', function () {
      assert.strictEqual(isEmpty(new Map([['k', 1]])), false);
      assert.strictEqual(isEmpty(new Set([1])), false);
    });

    it('treats plain objects with no keys as empty', function () {
      assert.strictEqual(isEmpty({}), true);
      assert.strictEqual(isEmpty(Object.create(null)), true);
    });

    it('treats plain objects with keys as non-empty', function () {
      assert.strictEqual(isEmpty({a: 1}), false);
    });

    it('treats functions as empty when they have no own string keys', function () {
      assert.strictEqual(
        isEmpty(() => {}),
        true,
      );
      const named = function namedFn() {};
      assert.strictEqual(isEmpty(named), true);
    });

    it('treats numbers and booleans as empty', function () {
      assert.strictEqual(isEmpty(0), true);
      assert.strictEqual(isEmpty(42), true);
      assert.strictEqual(isEmpty(false), true);
      assert.strictEqual(isEmpty(true), true);
    });
  });

  describe('escapeRegExp', function () {
    it('escapes metacharacters for safe RegExp construction', function () {
      const raw = '.*+?^${}()|[]\\';
      const escaped = escapeRegExp(raw);
      assert.strictEqual(new RegExp(escaped).test(raw), true);
      assert.strictEqual(new RegExp(escaped).test('x'), false);
    });

    it('leaves alphanumeric text unchanged', function () {
      assert.strictEqual(escapeRegExp('hello123'), 'hello123');
    });
  });
});

describe('utils/memoize', function () {
  it('caches by first argument', function () {
    let calls = 0;
    const fn = memoize((n: number) => {
      calls++;
      return n * 2;
    });
    assert.strictEqual(fn(3), 6);
    assert.strictEqual(fn(3), 6);
    assert.strictEqual(calls, 1);
    assert.strictEqual(fn(4), 8);
    assert.strictEqual(calls, 2);
  });

  it('uses resolver when provided', function () {
    let calls = 0;
    const fn = memoize(
      (_a: number, b: number) => {
        calls++;
        return b;
      },
      (_a, b) => b,
    );
    assert.strictEqual(fn(1, 5), 5);
    assert.strictEqual(fn(9, 5), 5);
    assert.strictEqual(calls, 1);
  });

  it('preserves this binding', function () {
    const obj = {
      x: 2,
      m: memoize(function (this: {x: number}, y: number) {
        return this.x + y;
      }),
    };
    assert.strictEqual(obj.m(3), 5);
    assert.strictEqual(obj.m(3), 5);
  });

  it('uses undefined as cache key for zero-arg calls (async-friendly)', async function () {
    let calls = 0;
    const fn = memoize(async () => {
      calls++;
      return 7;
    });
    const p1 = fn();
    const p2 = fn();
    assert.strictEqual(p1, p2);
    assert.strictEqual(await p1, 7);
    assert.strictEqual(calls, 1);
  });

  it('exposes a clearable cache map', function () {
    const fn = memoize((n: number) => n + 1);
    assert.strictEqual(fn(1), 2);
    fn.cache.clear();
    assert.strictEqual(fn(1), 2);
    assert.strictEqual(fn.cache.size, 1);
  });
});

describe('utils/lang object helpers', function () {
  describe('assignDefaults', function () {
    it('fills only undefined keys', function () {
      const target: Record<string, unknown> = {a: 1, b: undefined};
      assignDefaults(target, {b: 2, c: 3});
      assert.deepStrictEqual(target, {a: 1, b: 2, c: 3});
    });

    it('does not overwrite null', function () {
      const target: Record<string, unknown> = {a: null};
      assignDefaults(target, {a: 1});
      assert.strictEqual(target.a, null);
    });
  });

  describe('mergeDeep', function () {
    it('deep-merges nested objects', function () {
      const target = {a: {x: 1}, b: 2};
      mergeDeep(target, {a: {y: 2}, c: 3});
      assert.deepStrictEqual(target, {a: {x: 1, y: 2}, b: 2, c: 3});
    });
  });
});
