import {retry, retryInterval} from 'asyncbox';
import {HOST, PORT} from '../helpers/session';
import _ from 'lodash';
import chai, {expect} from 'chai';

chai.should();

const BASE_END_POINT = `http://${HOST}:${PORT}`;
const TEST_END_POINT = `${BASE_END_POINT}/test`;
const GUINEA_PIG_PAGE = `${TEST_END_POINT}/guinea-pig`;
const GUINEA_PIG_SCROLLABLE_PAGE = `${GUINEA_PIG_PAGE}-scrollable`;
const GUINEA_PIG_APP_BANNER_PAGE = `${GUINEA_PIG_PAGE}-app-banner`;
const GUINEA_PIG_FRAME_PAGE = `${TEST_END_POINT}/frameset.html`;
const GUINEA_PIG_IFRAME_PAGE = `${TEST_END_POINT}/iframes.html`;
// if the phishing URL stops working for some reason, see
// http://testsafebrowsing.appspot.com/ for alternatives
const PHISHING_END_POINT = 'http://testsafebrowsing.appspot.com/s/phishing.html';
const APPIUM_IMAGE = `${BASE_END_POINT}/appium.png`;
const newCookie = {
  name: 'newcookie',
  value: 'i am new here',
};
const oldCookie1 = {
  name: 'guineacookie1',
  value: 'i am a cookie value',
};
const oldCookie2 = {
  name: 'guineacookie2',
  value: 'cookié2',
};

function doesIncludeCookie(cookies, cookie) {
  expect(cookies.map((c) => c.name)).to.include(cookie.name);
  expect(cookies.map((c) => c.value)).to.include(cookie.value);
}
function doesNotIncludeCookie(cookies, cookie) {
  expect(cookies.map((c) => c.name)).to.not.include(cookie.name);
  expect(cookies.map((c) => c.value)).to.not.include(cookie.value);
}

async function spinTitle(driver) {
  return await retry(10, async function () {
    const title = await driver.getTitle();
    if (_.isNil(title)) {
      throw new Error('Did not get a page title');
    }
    return title;
  });
}

async function spinBodyIncludes(driver, expected) {
  return await retry(10, async function () {
    const el = await driver.$('//body');
    const body = await el.getHTML();
    if (!_.includes(body, expected)) {
      throw new Error(`Could not find '${expected}' in the page body. Found: '${body}'`);
    }
  });
}

async function spinTitleEquals(driver, expectedTitle, tries = 10, interval = 500) {
  await retryInterval(tries, interval, async function () {
    const title = await spinTitle(driver);
    if (title !== expectedTitle) {
      throw new Error(`Could not find expected title: '${expectedTitle}'. Found: '${title}'`);
    }
  });
}

async function spinTitleNotEquals(driver, wrongTitle, tries = 10, interval = 500) {
  await retryInterval(tries, interval, async function () {
    const title = await spinTitle(driver);
    if (title === wrongTitle) {
      throw new Error(`Found title we did not expect: '${title}'`);
    }
  });
}

async function spinWait(fn, waitMs = 10000, intMs = 500) {
  const tries = parseInt(String(waitMs / intMs), 10);
  await retryInterval(tries, intMs, fn);
}

async function openPage(driver, url, tries = 10, interval = 500) {
  await retryInterval(tries, interval, async function () {
    await driver.navigateTo(url);
    await spinTitleNotEquals(driver, 'cannot open page');
  });
}

export {
  spinTitle,
  spinTitleEquals,
  spinWait,
  openPage,
  GUINEA_PIG_PAGE,
  GUINEA_PIG_FRAME_PAGE,
  GUINEA_PIG_IFRAME_PAGE,
  PHISHING_END_POINT,
  APPIUM_IMAGE,
  GUINEA_PIG_SCROLLABLE_PAGE,
  GUINEA_PIG_APP_BANNER_PAGE,
  doesIncludeCookie,
  doesNotIncludeCookie,
  newCookie,
  oldCookie1,
  oldCookie2,
  spinBodyIncludes,
};

