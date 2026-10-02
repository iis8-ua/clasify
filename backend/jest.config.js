'use strict';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/prepararEntorno.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/db/*.js'],
  coverageDirectory: 'coverage',
  testTimeout: 20000
};
