import { chromium } from "@playwright/test";
import { Configure, InputConfigureContext } from "./configuration.js";
import { AllEdgeName, State, preparePack } from "./graph.js";
import sampleCollector from "./sampleCollector.js";
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
  const samples = sampleCollector("./samples/samples.json");

  const browser = await chromium.launch();
  const browserContext = await browser.newContext();
  const page = await browserContext.newPage();

  try {
    await conf.beforeAll?.(context);
    if (steps.length === 0) {
      throw new Error("No steps");
    }
    const firstStep = steps[0]!;
    const navigableStates = conf.graph.getNavigableStates();
    const initialState = navigableStates.find(
      (state) => state.id === edges[firstStep.edgeName]!.from
    );
    if (!initialState) {
      throw new Error("First step must be navigable");
    }
    const initialUrl = initialState.url;
    if (!initialUrl) {
      throw new Error("Initial state must have a url");
    }

    await page.goto(initialUrl);

    const pack = preparePack(conf.graph);
    for (const step of steps) {
      await conf.beforeEach?.({ ...context, step, pack: pack.getPack() });

      const edge = edges[step.edgeName]!;
      await edge.action({ edge, graph: conf.graph, page });
      pack.applyResourceEffects(
        edge.resourceEffects,
        (prev, value) => prev + value
      );

      const afterPack = pack.getPack();
      if (step.type === "action") {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        const domString = await page.content();
        samples.addSample(
          { screenshot: screenshotBuffer.toString("base64"), domString },
          step.edgeName,
          afterPack
        );
      }
      await conf.afterEach?.({ ...context, step, pack: afterPack });
    }
    await conf.afterAll?.(context);
    samples.storeSamples();
  } catch (e) {
    console.error("Error running steps");
    console.error(e);
  } finally {
    await browserContext.close();
    await browser.close();
  }
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
