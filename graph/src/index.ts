import { Graph, initGraph } from "./graph.js";
import { runScheduler } from "./scheduler.js";
import {
  states as allStates,
  edges as allEdges,
  resources as allResources,
} from "./state.js";
import _ from "lodash";

// TODO zod
// TODO integrate with initGraph
const parseGraphValidity = (graph: Graph<any, any, any, any>) => {
  const s = graph.getStates();
  const e = graph.getEdges();
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
    const graph = initGraph(allStates, allEdges, allResources);
    console.log("Validating graph format");
    parseGraphValidity(graph);

    console.log("Running Scheduler");
    const steps = runScheduler(graph);
    console.log("Scheduler Complete!");

    console.log("Running...");
    runSteps(steps, allEdges);
    console.log("Done");
  } catch (e) {
    console.error(e);
  }
}

main();
