import assert from 'node:assert/strict';

type Cookie = {
  name: string;
  value: string;
};

export const newCookie = {
  name: 'newcookie',
  value: 'i am new here',
};
export const oldCookie1 = {
  name: 'guineacookie1',
  value: 'i am a cookie value',
};
export const oldCookie2 = {
  name: 'guineacookie2',
  value: 'cookié2',
};

export function doesIncludeCookie(cookies: Cookie[], cookie: Cookie) {
  assert.ok(cookies.some((c) => c.name === cookie.name && c.value === cookie.value));
}
export function doesNotIncludeCookie(cookies: Cookie[], cookie: Cookie) {
  assert.ok(!cookies.some((c) => c.name === cookie.name && c.value === cookie.value));
}
