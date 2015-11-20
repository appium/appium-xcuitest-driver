"use strict";

try {
  var copySymlinks = require('./build/lib/copySymlinks.js').copySymlinks;
} catch (e) {
  // we catch this, so that `gulp watch` can keep looping.
}

var gulp = require('gulp'),
    boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);

gulp.task('prepareSymlinkedHeaders', function () {
  return gulp.src('./WebDriverAgent/Pods/Headers/**/*.h', { read: false })
    .pipe(copySymlinks());
});

boilerplate({build: 'appium-webdriveragent-driver', jscs: false, extraPrepublishTasks: ['prepareSymlinkedHeaders']});
