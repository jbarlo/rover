import { Configure, InputConfigureContext } from "./configuration.js";
import { AllEdgeName, State } from "./graph.js";
import { Step, runScheduler } from "./scheduler.js";
import _ from "lodash";

const runSteps = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  steps: Step<AllEdgeName<EdgeName, S["id"]>>[],
  conf: Configure<S["id"], S, EdgeName, Resource>
) => {
  const edges = conf.graph.getAllEdges();
  const context: InputConfigureContext<StateId, S, EdgeName, Resource> = {
    steps,
    graph: conf.graph,
  };
  conf.beforeAll?.(context);
  _.forEach(steps, (step) => {
    conf.beforeEach?.(context);
    const edge = edges[step.edgeName]!;
    edge.action({ edge, graph: conf.graph });
    conf.afterEach?.(context);
  });
  conf.afterAll?.(context);
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
    console.log("Scheduler Complete!");

    console.log("Running...");
    runSteps<StateId, S, EdgeName, Resource>(steps, conf);
    console.log("Done");
  } catch (e) {
    console.error(e);
  }
};

export default runner;
