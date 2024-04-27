import { runScheduler } from "./scheduler.js";
import { states as allStates, edges as allEdges } from "./state.js";
import _ from "lodash";

// TODO zod
const parseGraphValidity = (s: typeof allStates, e: typeof allEdges) => {
  if (s.length !== _.uniqBy(s, "id").length) {
    throw new Error("Duplicate state IDs");
  }

  if (e.length !== _.uniqBy(e, "name").length) {
    throw new Error("Duplicate edge names");
  }

  // TODO check non-start states don't have conflicting implied URLs
  // should URLs and startingness be separate? maybe URLs as groups?x
};

interface Step {
  edgeName: string;
  type: "prep" | "action" | "cleanup";
}

const runSteps = (steps: Step[], edges: typeof allEdges) => {
  // run each edge's prep, action, and cleanup -- do snapshotting, etc
  _.forEach(steps, (step) => {
    const edge = edges.find((e) => e.name === step.edgeName)!;
    if (_.isNil(edge)) throw new Error("Edge not found");
    edge.action();
  });
};

async function main() {
  console.log("Starting");
  try {
    console.log("Validating graph format");
    parseGraphValidity(allStates, allEdges);

    console.log("Running Scheduler");
    const steps = runScheduler(allStates, allEdges);
    console.log("Scheduler Complete!");

    console.log("Running...");
    runSteps(steps, allEdges);
    console.log("Done");
  } catch (e) {
    console.error(e);
  }
}

main();
