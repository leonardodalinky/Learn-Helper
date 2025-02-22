import { resolve, dirname } from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import ChildProcess from 'child_process';
import Randomstring from 'randomstring';

import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';
import NodePolyfillPlugin from 'node-polyfill-webpack-plugin';
import RemovePlugin from 'remove-files-webpack-plugin';
import { GitRevisionPlugin } from 'git-revision-webpack-plugin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readVersion = (pkg) =>
  JSON.parse(readFileSync(`./node_modules/${pkg}/package.json`).toString()).version;

const createIndex = new HtmlWebpackPlugin({
  template: './src/index.html',
  filename: './index.html',
  excludeChunks: ['background'],
});

const copyPolyFill = new CopyPlugin({
  patterns: [
    { from: './node_modules/webextension-polyfill/dist/browser-polyfill.min.js', to: './' },
  ],
});

const gitRevision = new GitRevisionPlugin({
  branch: true,
  versionCommand: 'describe --always --tags --dirty',
});

const removeRedundantFile = new RemovePlugin({
  // remove output dist files
  before: {
    include: [
      './dist/background.js',
      './dist/index.html',
      './dist/browser-polyfill.min.js',
      './dist/index.js',
      './dist/welcome.js',
      './dist/inject_csrf_token.js',
    ],
  },
  // remove files produced by GitRevisionPlugin
  after: {
    include: ['./dist/BRANCH', './dist/COMMITHASH', './dist/LASTCOMMITDATETIME', './dist/VERSION'],
  },
});

const commitDate = ChildProcess.execSync(
  'git log -1 --date=format:"%Y/%m/%d %T" --format="%ad"',
).toString();

const hostname = ChildProcess.execSync('hostname').toString();

const buildTime = ChildProcess.execSync('date +"%Y/%m/%d %T"').toString();

const randomSuffix = Randomstring.generate(4);

const BUILD_CONSTANTS = {
  __HELPER_VERSION__: JSON.stringify(readVersion('..')),
  __GIT_VERSION__: JSON.stringify(gitRevision.version().trim()),
  __GIT_COMMIT_HASH__: JSON.stringify(gitRevision.commithash().trim()),
  __GIT_COMMIT_DATE__: JSON.stringify(commitDate.trim()),
  __GIT_BRANCH__: JSON.stringify(gitRevision.branch().trim()),
  __BUILD_HOSTNAME__: JSON.stringify(hostname.trim()),
  __BUILD_TIME__: JSON.stringify(buildTime.trim()),
  __THU_LEARN_LIB_VERSION__: JSON.stringify(readVersion('thu-learn-lib')),
  __MUI_VERSION__: JSON.stringify(readVersion('@material-ui/core')),
  __REACT_VERSION__: JSON.stringify(readVersion('react')),
  __LEARN_HELPER_CSRF_TOKEN_PARAM__: JSON.stringify(`__learn-helper-csrf-token-${randomSuffix}__`),
  __LEARN_HELPER_CSRF_TOKEN_INJECTOR__: JSON.stringify(
    `__learn_helper_csrf_token_injector_${randomSuffix}__`,
  ),
};

console.log('Build time constants', BUILD_CONSTANTS);

const defineConstants = new webpack.DefinePlugin(BUILD_CONSTANTS);

export default {
  entry: {
    index: './src/index.tsx',
    background: './src/background.ts',
    welcome: './src/welcome.js',
    inject_csrf_token: './src/inject_csrf_token.js',
  },
  output: {
    path: resolve('./dist'),
    filename: '[name].js',
  },
  plugins: [
    createIndex,
    copyPolyFill,
    new NodePolyfillPlugin(),
    gitRevision,
    defineConstants,
    removeRedundantFile,
  ],
  devServer: {
    contentBase: './dist',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-modules-typescript-loader',
          {
            loader: 'css-loader',
            options: {
              modules: {
                localIdentName: '[name]--[local]--[hash:base64:5]',
              },
            },
          },
        ],
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js'],
    alias: {
      parse5: resolve(__dirname, 'node_modules/thu-learn-lib/src/fake-parse5/'),
      'parse5-htmlparser2-tree-adapter': resolve(
        __dirname,
        'node_modules/thu-learn-lib/src/fake-parse5/',
      ),
      // "react": "preact/compat",
      // "react-dom/test-utils": "preact/test-utils",
      // "react-dom": "preact/compat",
    },
  },
};
