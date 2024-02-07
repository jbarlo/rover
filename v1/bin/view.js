#!/usr/bin/env node

const shell = require("shelljs");
const path = require("path");
const { getConfig } = require("../dist/snap/getConfig");

const { port } = getConfig();

const distWebPath = path.resolve(__dirname, "../dist/web");
shell.exec(`PORT="${port}" remix-serve ${distWebPath}`);
