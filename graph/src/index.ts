import { Edges, State, initGraph } from "./graph.js";
import { Step, runScheduler } from "./scheduler.js";
import { states, edges, resources } from "./state.js";
import _ from "lodash";

const runSteps = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  steps: Step<EdgeName>[],
  edges: Edges<EdgeName, S[], Resource>
) => {
  // run each edge's prep, action, and cleanup -- do snapshotting, etc
  const keyedEdges = _.keyBy(edges, (e) => e.name);
  _.forEach(steps, (step) => {
    const edge = keyedEdges[step.edgeName]!;
    if (_.isNil(edge)) throw new Error("Edge not found");
    edge.action();
  });
};

async function main() {
  console.log("Starting");
  try {
    const graph = initGraph(states, edges, resources);

    console.log("Running Scheduler");
    const steps = runScheduler(graph);
    // console.log(JSON.stringify(steps, null, 2));
    console.log("Scheduler Complete!");

    console.log("Running...");
    runSteps(steps, graph.getEdges());
    console.log("Done");
  } catch (e) {
    console.error(e);
  }
}

main();
