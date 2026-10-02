'use strict';

const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_TEST_NAME || 'clasify_test';
