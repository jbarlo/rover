#!/usr/bin/env node

const shell = require("shelljs");

shell.exec("remix-serve ./dist/web");
