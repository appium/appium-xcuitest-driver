/* eslint-disable promise/prefer-await-to-then */
const requestPromise = require('request-promise');
const request = require('request');
const fs = require('fs');
const gulp = require('gulp');
const B = require('bluebird');
const log = require('fancy-log');
const support = require('appium-support');


/**
 * Temporary gulp task to prove that this works. Once everything is good,
 * this should be moved to `appium-gulp-plugins` to be available in other
 * modules
 */

gulp.task('upload-to-sauce-storage', function () {
  let tempDir;
  // Find the latest bundle
  log.info('Retrieving Bintray asset and uploading to Sauce Storage');
  return support.tempDir.openDir()
    .then(function (dir) {
      log.info(`Temporary directory for download: '${dir}'`);
      tempDir = dir;
    })
    .then(function () {
      return requestPromise({
        method: 'GET',
        uri: 'https://api.bintray.com/packages/appium-builds/appium/appium/files',
        json: true,
      });
    })
    .then(function getLatest (parsedBody) {
      const fileInfoArray = parsedBody;
      const latestFile = fileInfoArray.sort((fileInfo1, fileInfo2) => (
        Math.sign(+new Date(fileInfo2.created) - (+new Date(fileInfo1.created)))
      ))[0];
      const {name: bundleName} = latestFile;
      return bundleName;
    })
    .then(function getStagingUrl (bundleName) {
      const stagingUrl = `https://bintray.com/appium-builds/appium/download_file?file_path=${bundleName}`;
      log.info(`Using Appium staging URL: '${stagingUrl}'`);
      return stagingUrl;
    })
    .then(function download (stagingUrl) {
      return new B((resolve, reject) => {
        request(stagingUrl)
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
