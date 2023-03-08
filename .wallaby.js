'use strict';

module.exports = (wallaby) => {
  return {
    compilers: {
      '**/*.js': wallaby.compilers.typeScript({
        allowJs: true,
        allowSyntheticDefaultImports: true,
        resolveJsonModule: true,
        isolatedModules: true,
      }),
    },
    debug: true,
    env: {
      type: 'node',
    },
    files: ['./lib/**/*.js', './test/unit/helpers.js', 'package.json'],
    testFramework: 'mocha',
    tests: ['./test/unit/**/*-specs.js'],
    runMode: 'onsave',
    workers: {recycle: true},
    setup() {
      const chai = require('chai');
      const chaiAsPromised = require('chai-as-promised');
      chai.use(chaiAsPromised);
      chai.should();
    }
  };
};
