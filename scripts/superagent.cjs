#!/usr/bin/env node
'use strict';
const { main, runCli } = require('../plugins/superagent/distribution/scripts/superagent.cjs');
if (require.main === module) runCli();
module.exports = { main };
