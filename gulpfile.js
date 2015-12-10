"use strict";

var gulp = require('gulp'),
    boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);

gulp.task('prepareSymlinkedHeaders', function () {
  // require copySymlinks here so that it's transpiled first.
  var copySymlinks = require('./build/lib/copySymlinks.js').copySymlinks;
  return gulp.src('./WebDriverAgent/Pods/Headers/**/*.h', { read: false })
    .pipe(copySymlinks());
});

boilerplate({build: 'appium-webdriveragent-driver', jscs: false, extraPrepublishTasks: ['prepareSymlinkedHeaders']});
