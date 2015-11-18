"use strict";

var copySymlinks = require('./build/lib/copySymlinks.js').copySymlinks;
var debug = require('gulp-debug');
var vinylPaths = require('vinyl-paths');
var del = require('del');
var devnull = require('dev-null');

var gulp = require('gulp'),
    boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);

gulp.task('copySymlinks', function () {
  return gulp.src('./WebDriverAgent/Pods/Headers/**/*.h')
    .pipe(copySymlinks())
    .pipe(gulp.dest('tmp/Pods/Headers'));
});

gulp.task('deletePodHeaders', ['copySymlinks'], function (cb) {
  return gulp.src('./WebDriverAgent/Pods/Headers/**/*.h')
    .pipe(vinylPaths(del))
});

gulp.task('copyTmpHeaders', ['deletePodHeaders'], function () {
  return gulp.src('tmp/Pods/Headers/**')
    .pipe(gulp.dest('WebDriverAgent/Pods/Headers'));
});

gulp.task('cleanTmp', ['copyTmpHeaders'], function () {
  return gulp.src('./tmp')
    .pipe(vinylPaths(del))
});

gulp.task('prepareSymlinkedHeaders', ['copySymlinks', 'deletePodHeaders', 'copyTmpHeaders', 'cleanTmp']);


boilerplate({build: 'appium-webdriveragent-driver', jscs: false, extraPrepublishTasks: ['prepareSymlinkedHeaders']});
