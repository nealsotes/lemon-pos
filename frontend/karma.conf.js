// Karma configuration for the Angular unit-test harness.
// See https://karma-runner.github.io/6.4/config/configuration-file.html

const fs = require('fs');
const path = require('path');

/**
 * karma-chrome-launcher finds Chrome through environment variables that some
 * shells and CI images do not export (ProgramFiles, LOCALAPPDATA, ...). Probe the
 * usual install locations so `npm test` works without a manual setup step.
 * An explicit CHROME_BIN always wins.
 */
function resolveChromeBin() {
  if (process.env['CHROME_BIN']) {
    return process.env['CHROME_BIN'];
  }

  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env['USERPROFILE'] || '', 'AppData/Local/Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];

  return candidates.find(candidate => candidate && fs.existsSync(candidate));
}

const chromeBin = resolveChromeBin();
if (chromeBin) {
  process.env['CHROME_BIN'] = chromeBin;
}

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      jasmine: {},
      clearContext: false // leave the Jasmine spec runner visible in watch mode
    },
    jasmineHtmlReporter: {
      suppressAll: true // group failures at the end of the report
    },
    coverageReporter: {
      dir: path.join(__dirname, './coverage/pos-system'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }]
    },
    reporters: ['progress', 'kjhtml'],
    browsers: ['ChromeHeadless'],
    customLaunchers: {
      // Headless Chrome with the flags container and CI environments need.
      ChromeHeadlessCI: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
      }
    },
    restartOnFileChange: true
  });
};
