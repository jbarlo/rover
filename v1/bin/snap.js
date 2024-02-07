#!/usr/bin/env node

const shell = require("shelljs");
const path = require("path");

const distSnapPath = path.resolve(__dirname, "../dist/snap/index.js");
shell.exec(`node ${distSnapPath}`);
