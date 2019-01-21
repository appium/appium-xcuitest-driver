'use strict';

const gulp = require('gulp');
const boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);


boilerplate({
  build: 'appium-xcuitest-driver',
  projectRoot: __dirname,
  coverage: {
    files: ['./build/test/unit/**/*-specs.js', '!./build/test/functional/**'],
    verbose: false
  },
});
