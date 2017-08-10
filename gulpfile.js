"use strict";


let gulp = require('gulp'),
    boilerplate = require('appium-gulp-plugins').boilerplate.use(gulp);

boilerplate({
  build: 'appium-xcuitest-driver',
  coverage: {
    files: ['./test/unit/**/*-specs.js', '!./test/functional/**'],
    verbose: true
  },
});
