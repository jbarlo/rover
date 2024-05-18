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
  conf: Configure<StateId, S, EdgeName, Resource>
) => {
  const edges = conf.graph.getEdges();
  _.forEach(steps, (step) => {
    conf.beforeEach?.();
    const edge = edges[step.edgeName]!;
    edge.action();
    conf.afterEach?.();
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
    runSteps<StateId, S, EdgeName, Resource>(steps, conf);
    console.log("Done");
  } catch (e) {
    console.error(e);
  }
};

export default runner;
