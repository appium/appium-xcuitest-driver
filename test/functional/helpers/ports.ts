import {net} from 'appium/support.js';

export async function getFreePort(): Promise<number> {
  return await net.getFreePort();
}
