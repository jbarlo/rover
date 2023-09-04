#!/usr/bin/env node

const shell = require("shelljs");
const path = require("path");

const distWebPath = path.resolve(__dirname, "../dist/web");
shell.exec(`remix-serve ${distWebPath}`);
