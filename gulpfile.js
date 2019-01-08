'use strict';

const gulp = require('gulp');
const boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);


require('./ci/mpt-fix');
require('./ci/upload-appium');

boilerplate({
  build: 'appium-xcuitest-driver',
  coverage: {
    files: ['./build/test/unit/**/*-specs.js', '!./build/test/functional/**'],
    verbose: false
  },
});
