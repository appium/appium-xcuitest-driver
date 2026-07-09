import {expect} from 'chai';

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
  expect(cookies.map((c) => c.name)).to.include(cookie.name);
  expect(cookies.map((c) => c.value)).to.include(cookie.value);
}
export function doesNotIncludeCookie(cookies: Cookie[], cookie: Cookie) {
  expect(cookies.map((c) => c.name)).to.not.include(cookie.name);
  expect(cookies.map((c) => c.value)).to.not.include(cookie.value);
}
