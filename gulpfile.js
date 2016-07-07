"use strict";


var gulp = require('gulp'),
    boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);

boilerplate({
  build: 'appium-xcuitest-driver',
  jscs: false,
  test: {
    files: ['${testDir}/**/*-specs.js', '!${testDir}/functional/**']
  },
  e2eTest: {
    files: '${testDir}/functional/**/*-specs.js',
  },
  testReporter: 'spec'
});
