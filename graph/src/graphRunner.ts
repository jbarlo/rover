import { Configure, InputConfigureContext } from "./configuration.js";
import { AllEdgeName, State } from "./graph.js";
import { Step, runScheduler } from "./scheduler.js";
import _ from "lodash";

const runSteps = async <
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
  await conf.beforeAll?.(context);
  for (const step of steps) {
    await conf.beforeEach?.(context);
    const edge = edges[step.edgeName]!;
    await edge.action({ edge, graph: conf.graph });
    await conf.afterEach?.(context);
  }
  await conf.afterAll?.(context);
};

const runner = async <
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
    await runSteps<StateId, S, EdgeName, Resource>(steps, conf);
    console.log("Done");
  } catch (e) {
    console.error(e);
  }
};

export default runner;
