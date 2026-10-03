#!/usr/bin/env node
'use strict';
// Legacy name retained as an explicit offline CLI alias. No scan or conclusions.
const { cli } = require('./we-analysis-report');
if (require.main === module) cli().catch(error => { console.error(error.message); process.exitCode = 1; });
