import runner from "./graphRunner.js";
import _ from "lodash";
import path from "path";
import { verifyIsConfig } from "./configuration.js";

async function main() {
  const config = verifyIsConfig(
    (
      await import(
        path.join(path.dirname(import.meta.url), "..", "graph.config.ts")
      )
    ).default
  );
  runner(config);
}

main();
