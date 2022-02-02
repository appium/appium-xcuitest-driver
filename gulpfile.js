'use strict';

const gulp = require('gulp');
const boilerplate = require('@appium/gulp-plugins').boilerplate.use(gulp);
const DEFAULTS = require('@appium/gulp-plugins').boilerplate.DEFAULTS;


boilerplate({
  build: 'appium-xcuitest-driver',
  projectRoot: __dirname,
  files: DEFAULTS.files.concat('index.js'),
  coverage: {
    files: ['./build/test/unit/**/*-specs.js', '!./build/test/functional/**'],
    verbose: false
  },
});
