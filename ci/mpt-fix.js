/* eslint-disable promise/prefer-await-to-then */
/* eslint-disable promise/prefer-await-to-callbacks */

/**
 * `mocha-parallel-tests` is broken at the moment, so skipped describe blocks fail
 * the fix is simple, and this patches the error until they fix the package
 **/
const fs = require('appium-support').fs;
const path = require('path');
const gulp = require('gulp');
const log = require('fancy-log');


/**
 * Temporary gulp task to prove that this works. Once everything is good,
 * this should be moved to `appium-gulp-plugins` to be available in other
 * modules
 */

gulp.task('fix-mocha-parallel-tests', function () {
  const filePath = path.resolve(__dirname, '..', 'node_modules', 'mocha-parallel-tests', 'dist', 'main', 'util.js');

  return fs.readFile(filePath, {encoding: 'utf8'})
    .then(function (script) {
      return script.replace(`if (value.type === 'test') {`, `if (value.type === 'test') {\n        delete value.fn;`);
    })
    .then(function (script) {
      return fs.writeFile(filePath, script);
    })
    .catch(function (err) {
      log.error(`Unable to fix 'mocha-parallel-tests': ${err.message}`);
      throw err;
    });
});
