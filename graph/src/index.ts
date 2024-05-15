import { Graph, State, verifyIsGraph } from "./graph.js";
import { Step, runScheduler } from "./scheduler.js";
import _ from "lodash";
import path from "path";

const runSteps = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  steps: Step<EdgeName>[],
  graph: Graph<StateId, S, EdgeName, Resource>
) => {
  const edges = graph.getEdges();
  // run each edge's prep, action, and cleanup -- do snapshotting, etc
  _.forEach(steps, (step) => {
    const edge = edges[step.edgeName]!;
    edge.action();
  });
};

async function main() {
  console.log("Starting");
  try {
    const graph = verifyIsGraph(
      (
        await import(
          path.join(path.dirname(import.meta.url), "..", "graph.config.ts")
        )
      ).default
    );

    console.log("Running Scheduler");
    const steps = runScheduler(graph);
    // console.log(JSON.stringify(steps, null, 2));
    console.log("Scheduler Complete!");

    console.log("Running...");
    runSteps(steps, graph);
    console.log("Done");
  } catch (e) {
    console.error(e);
  }
}

main();
