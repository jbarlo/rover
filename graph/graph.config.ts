import { chromium } from "playwright";
import { configure } from "./src/configuration.js";
import sampleCollector from "./src/sampleCollector.js";

// TODO possible configs:
//  - gte/lte
//  - nonnegative resource? all edges with that resource in the condition gets
//    anded with >=0?

const samples = sampleCollector();

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

export default configure({
  beforeEach: async () => {},
  afterEach: async ({ step, pack }) => {
    if (step.type === "action") {
      const screenshotBuffer = await page.screenshot({ fullPage: true });
      samples.addSample(
        { screenshot: screenshotBuffer.toString("base64") },
        step.edgeName,
        pack
      );
    }
  },
  beforeAll: async ({ steps, graph }) => {
    if (steps.length === 0) {
      throw new Error("No steps");
    }
    const firstStep = steps[0]!;
    const navigableStates = graph.getNavigableStates();
    const edges = graph.getAllEdges();
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

    console.log("start at", initialUrl);
    await page.goto(initialUrl);
  },
  afterAll: async () => {
    await context.close();
    await browser.close();

    samples.storeSamples();
  },
  graph: {
    implicitEdgeAction: async ({ edge, graph }) => {
      const navigableStates = graph.getNavigableStates();
      const navigableState = navigableStates.find(
        (state) => state.id === edge.to
      );
      if (!navigableState) {
        throw new Error("Implicit edge must go to a navigable state");
      }
      const url = navigableState.url;
      if (!url) {
        throw new Error("Navigable state must have a url");
      }

      console.log("go to", url);
      await page.goto(url);
    },
    states: [
      { id: "search", url: "https://www.google.com" },
      { id: "results" },
      { id: "results2" },
    ] as const,
    edges: [
      {
        from: "search",
        to: "results",
        name: "search",
        action: async () => {
          await page.fill('textarea[aria-label="Search"]', "playwright");
          await page.press('textarea[aria-label="Search"]', "Enter");
        },
      },
      {
        from: "search",
        to: "results2",
        name: "search2",
        action: async () => {},
      },
      // {
      //   from: "results",
      //   to: "search",
      //   name: "back home",
      //   action: () => {},
      // },
    ],
    // TODO would be nice to generate this from types
    // TODO allow no resources
    resources: ["temp"],
  },
});
