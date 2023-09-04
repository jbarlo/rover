#! /usr/bin/env node
const shell = require("shelljs");

shell.exec("npm exec snap && npm exec view");
