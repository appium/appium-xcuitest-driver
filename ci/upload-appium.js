/* eslint-disable promise/prefer-await-to-then */
const requestPromise = require('request-promise');
const request = require('request');
const fs = require('fs');
const gulp = require('gulp');
const B = require('bluebird');
const log = require('fancy-log');
const support = require('appium-support');
const octokit = require('@octokit/rest')();
const _ = require('lodash');

/**
 * Temporary gulp task to prove that this works. Once everything is good,
 * this should be moved to `appium-gulp-plugins` to be available in other
 * modules
 */

const ASSET_NAME_REGEXP = /^appium-\S+.zip$/;

const owner = 'appium';
const repo = 'appium-build-store';


gulp.task('authenticate', function (done) {
  const githubToken = process.env.GITHUB_TOKEN;

  if (_.isEmpty(githubToken)) {
    log.warn('No GitHub token found in GITHUB_TOKEN environment variable');
    return;
  }

  octokit.authenticate({
    type: 'token',
    token: githubToken,
  });
  done();
});

gulp.task('upload', function () {
  let tempDir;
  // Find the latest bundle
  log.info('Retrieving asset and uploading to Sauce Storage');
  return support.tempDir.openDir()
    .then(function (dir) {
      log.info(`Temporary directory for download: '${dir}'`);
      tempDir = dir;
    })
    .then(function () {
      return octokit.repos.getLatestRelease({owner, repo});
    })
    .then(function (res) {
      // go through the assets and fine the correct one
      for (const asset of res.data.assets) {
        if (ASSET_NAME_REGEXP.test(asset.name)) {
          log.info(`Downloading asset from '${asset.browser_download_url}'`);
          return asset.browser_download_url;
        }
      }
      throw new Error(`Unable to find Appium build asset`);
    })
    .then(function download (url) {
      return new B((resolve, reject) => {
        request(url)
          .on('error', reject) // handle real errors, like connection errors
          .on('response', (res) => {
            // handle responses that fail, like 404s
            if (res.statusCode >= 400) {
              return reject(`Error downloading file: ${res.statusCode}`);
            }
          })
          .pipe(fs.createWriteStream(`${tempDir}/appium.zip`))
          .on('close', resolve);
      });
    })
    .then(function upload () {
      const options = {
        method: 'POST',
        uri: `https://saucelabs.com/rest/v1/storage/${process.env.SAUCE_USERNAME}/appium.zip?overwrite=true`,
        headers: {
          'Content-Type': 'application/octet-stream',
        },
        auth: {
          user: process.env.SAUCE_USERNAME,
          pass: process.env.SAUCE_ACCESS_KEY,
        },
        formData: {
          file: {
            value: fs.createReadStream(`${tempDir}/appium.zip`),
            options: {
              filename: 'appium.zip',
              contentType: 'application/zip, application/octet-stream',
            },
          }
        },
      };
      return requestPromise(options)
        .then(function (body) {
          log.info(`File uploaded: ${body}`);
        });
    });
});

gulp.task('sauce-storage-upload', gulp.series(['authenticate', 'upload']));
