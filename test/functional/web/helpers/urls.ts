import {HOST, PORT} from '../../helpers/session';

// if the phishing URL stops working for some reason, see
// http://testsafebrowsing.appspot.com/ for alternatives
export const PHISHING_END_POINT = 'http://testsafebrowsing.appspot.com/s/phishing.html';
export const APPIUM_IMAGE = `http://${HOST}:${PORT}/appium.png`;
