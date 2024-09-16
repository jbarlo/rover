import { configure } from "./src/configuration";

// TODO possible configs:
//  - gte/lte
//  - nonnegative resource? all edges with that resource in the condition gets
//    anded with >=0?

export default configure({
  beforeEach: async () => {},
  afterEach: async () => {},
  beforeAll: async () => {},
  afterAll: async () => {},
  graph: {
    implicitEdgeAction: async ({ edge, graph, page }) => {
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
    ],
    edges: [
      {
        from: "search",
        to: "results",
        name: "search",
        action: async ({ page }) => {
          await page.fill('textarea[aria-label="Search"]', "playwright");
          await page.press('textarea[aria-label="Search"]', "Enter");
        },
      },
      {
        from: "search",
        to: "results2",
        name: "search2",
        resourceEffects: { temp: 1 },
        action: async () => {},
      },
      {
        from: "results2",
        to: "search",
        name: "back home",
        resourceEffects: { temp: -1 },
        action: async () => {},
      },
    ],
    // TODO would be nice to generate this from types
    // TODO allow no resources
    resources: ["temp"],
  },
});
