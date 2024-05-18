import { Configure } from "./configuration.js";
import { AllEdgeNames, Graph, State } from "./graph.js";
import { Step, runScheduler } from "./scheduler.js";
import _ from "lodash";

const runSteps = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  steps: Step<AllEdgeNames<StateId, EdgeName, Resource>>[],
  graph: Graph<StateId, S, EdgeName, Resource>
) => {
  const edges = graph.getEdges();
  // run each edge's prep, action, and cleanup -- do snapshotting, etc
  _.forEach(steps, (step) => {
    const edge = edges[step.edgeName]!;
    edge.action();
  });
};

const runner = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  conf: Configure<StateId, S, EdgeName, Resource>
) => {
  console.log("Starting");
  try {
    console.log("Running Scheduler");
    const steps = runScheduler(conf.graph);
    // console.log(JSON.stringify(steps, null, 2));
    console.log("Scheduler Complete!");

    console.log("Running...");
    runSteps<StateId, S, EdgeName, Resource>(steps, conf.graph);
    console.log("Done");
  } catch (e) {
    console.error(e);
  }
};

export default runner;
