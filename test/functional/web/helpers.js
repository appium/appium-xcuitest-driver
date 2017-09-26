import { retry, retryInterval } from 'asyncbox';
import { HOST, PORT } from '../helpers/session';
import { util } from 'appium-support';


const BASE_END_POINT = `http://${process.env.REAL_DEVICE ? util.localIp() : HOST}:${PORT}`;
const TEST_END_POINT = `${BASE_END_POINT}/test`;
const GUINEA_PIG_PAGE = `${TEST_END_POINT}/guinea-pig`;
const GUINEA_PIG_SCROLLABLE_PAGE = `${GUINEA_PIG_PAGE}-scrollable`;
const GUINEA_PIG_APP_BANNER_PAGE = `${GUINEA_PIG_PAGE}-app-banner`;
const GUINEA_PIG_FRAME_PAGE = `${TEST_END_POINT}/frameset.html`;
const GUINEA_PIG_IFRAME_PAGE = `${TEST_END_POINT}/iframes.html`;
const PHISHING_END_POINT = TEST_END_POINT.replace('http://', 'http://foo:bar@');
const APPIUM_IMAGE = `${BASE_END_POINT}/appium.png`;

async function spinTitle (driver) {
  let title = await retry(10, async () => {
    let title = await driver.title();
    if (!title) {
      throw new Error('did not get page title');
    }
    return title;
  });

  return title;
}

async function spinTitleEquals (driver, expectedTitle, tries = 90, interval = 500) {
  await retryInterval(tries, interval, async () => {
    let title = await spinTitle(driver);
    if (title !== expectedTitle) {
      throw new Error(`Could not find expected title. Found: '${title}'`);
    }
  });
}

async function spinWait (fn, waitMs = 10000, intMs = 500) {
  let tries = parseInt(waitMs / intMs, 10);
  await retryInterval(tries, intMs, fn);
}

export { spinTitle, spinTitleEquals, spinWait, GUINEA_PIG_PAGE,
         GUINEA_PIG_FRAME_PAGE, GUINEA_PIG_IFRAME_PAGE, PHISHING_END_POINT,
         APPIUM_IMAGE, GUINEA_PIG_SCROLLABLE_PAGE, GUINEA_PIG_APP_BANNER_PAGE };
