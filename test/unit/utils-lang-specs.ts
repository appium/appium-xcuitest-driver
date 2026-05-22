import {expect} from 'chai';
import {assignDefaults, escapeRegExp, isEmpty, memoize, mergeDeep} from '../../lib/utils';

describe('utils/lang', function () {
  describe('isEmpty', function () {
    it('treats null and undefined as empty', function () {
      expect(isEmpty(null)).to.be.true;
      expect(isEmpty(undefined)).to.be.true;
    });

    it('treats empty string, array, Buffer as empty', function () {
      expect(isEmpty('')).to.be.true;
      expect(isEmpty([])).to.be.true;
      expect(isEmpty(Buffer.alloc(0))).to.be.true;
    });

    it('treats non-empty string, array, Buffer as non-empty', function () {
      expect(isEmpty('a')).to.be.false;
      expect(isEmpty([0])).to.be.false;
      expect(isEmpty(Buffer.from([1]))).to.be.false;
    });

    it('treats empty Map and Set as empty', function () {
      expect(isEmpty(new Map())).to.be.true;
      expect(isEmpty(new Set())).to.be.true;
    });

    it('treats populated Map and Set as non-empty', function () {
      expect(isEmpty(new Map([['k', 1]]))).to.be.false;
      expect(isEmpty(new Set([1]))).to.be.false;
    });

    it('treats plain objects with no keys as empty', function () {
      expect(isEmpty({})).to.be.true;
      expect(isEmpty(Object.create(null))).to.be.true;
    });

    it('treats plain objects with keys as non-empty', function () {
      expect(isEmpty({a: 1})).to.be.false;
    });

    it('treats functions as empty when they have no own string keys', function () {
      expect(isEmpty(() => {})).to.be.true;
      const named = function namedFn() {};
      expect(isEmpty(named)).to.be.true;
    });

    it('treats numbers and booleans as empty', function () {
      expect(isEmpty(0)).to.be.true;
      expect(isEmpty(42)).to.be.true;
      expect(isEmpty(false)).to.be.true;
      expect(isEmpty(true)).to.be.true;
    });
  });

  describe('escapeRegExp', function () {
    it('escapes metacharacters for safe RegExp construction', function () {
      const raw = '.*+?^${}()|[]\\';
      const escaped = escapeRegExp(raw);
      expect(new RegExp(escaped).test(raw)).to.be.true;
      expect(new RegExp(escaped).test('x')).to.be.false;
    });

    it('leaves alphanumeric text unchanged', function () {
      expect(escapeRegExp('hello123')).to.equal('hello123');
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
    expect(fn(3)).to.equal(6);
    expect(fn(3)).to.equal(6);
    expect(calls).to.equal(1);
    expect(fn(4)).to.equal(8);
    expect(calls).to.equal(2);
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
    expect(fn(1, 5)).to.equal(5);
    expect(fn(9, 5)).to.equal(5);
    expect(calls).to.equal(1);
  });

  it('preserves this binding', function () {
    const obj = {
      x: 2,
      m: memoize(function (this: {x: number}, y: number) {
        return this.x + y;
      }),
    };
    expect(obj.m(3)).to.equal(5);
    expect(obj.m(3)).to.equal(5);
  });

  it('uses undefined as cache key for zero-arg calls (async-friendly)', async function () {
    let calls = 0;
    const fn = memoize(async () => {
      calls++;
      return 7;
    });
    const p1 = fn();
    const p2 = fn();
    expect(p1).to.equal(p2);
    expect(await p1).to.equal(7);
    expect(calls).to.equal(1);
  });

  it('exposes a clearable cache map', function () {
    const fn = memoize((n: number) => n + 1);
    expect(fn(1)).to.equal(2);
    fn.cache.clear();
    expect(fn(1)).to.equal(2);
    expect(fn.cache.size).to.equal(1);
  });
});

describe('utils/lang object helpers', function () {
  describe('assignDefaults', function () {
    it('fills only undefined keys', function () {
      const target: Record<string, unknown> = {a: 1, b: undefined};
      assignDefaults(target, {b: 2, c: 3});
      expect(target).to.deep.equal({a: 1, b: 2, c: 3});
    });

    it('does not overwrite null', function () {
      const target: Record<string, unknown> = {a: null};
      assignDefaults(target, {a: 1});
      expect(target.a).to.be.null;
    });
  });

  describe('mergeDeep', function () {
    it('deep-merges nested objects', function () {
      const target = {a: {x: 1}, b: 2};
      mergeDeep(target, {a: {y: 2}, c: 3});
      expect(target).to.deep.equal({a: {x: 1, y: 2}, b: 2, c: 3});
    });
  });
});
