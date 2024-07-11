import runner from "./graphRunner.js";
import _ from "lodash";
import path from "path";
import { initConfiguration } from "./configuration.js";

async function main() {
  const config = initConfiguration(
    (
      await import(
        path.join(path.dirname(import.meta.url), "..", "graph.config.ts")
      )
    ).default
  );
  await runner(config);
}

// FIXME move this to npm bin
main();
