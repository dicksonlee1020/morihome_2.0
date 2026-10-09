const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../..');
const resultDir = path.join(root, 'test-results/browser');
fs.mkdirSync(resultDir, { recursive: true });
module.exports = {
  htmlUrl: pathToFileURL(path.join(root, 'dist-single/morihome-erp.html')).href,
  resultPath: (name) => path.join(resultDir, name),
  launchOptions: {
    headless: true,
    ...(process.env.MORI_CHROMIUM_PATH
      ? { executablePath: process.env.MORI_CHROMIUM_PATH }
      : {}),
    ...(process.env.MORI_CHROMIUM_ARGS
      ? { args: JSON.parse(process.env.MORI_CHROMIUM_ARGS) }
      : {}),
  },
};
