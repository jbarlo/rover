#!/usr/bin/env node
import runner from "../graphRunner.js";
import _ from "lodash";
import path from "path";
import { initConfiguration } from "../configuration.js";
import { bundleRequire } from "bundle-require";

async function loadTsConfig(configPath: string): Promise<unknown> {
  const configAbsolutePath = path.resolve(configPath);

  const { mod } = await bundleRequire({ filepath: configAbsolutePath });
  return mod.default;
}

async function main() {
  const configPath = path.join(process.cwd(), "graph.config.ts");
  const configModule = await loadTsConfig(configPath);
  const config = initConfiguration(configModule as any);
  await runner(config);
}

main();
