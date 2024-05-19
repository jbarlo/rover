import { configure } from "./src/configuration.js";

// TODO possible configs:
//  - gte/lte
//  - nonnegative resource? all edges with that resource in the condition gets
//    anded with >=0?

export default configure({
  beforeEach: () => {},
  afterEach: () => {},
  beforeAll: ({ steps, graph }) => {
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

    // TODO goto url
    console.log("start at", initialUrl);
  },
  afterAll: () => {},
  graph: {
    implicitEdgeAction: ({ edge, graph }) => {
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

      // TODO goto url
      console.log("go to", url);
    },
    states: [
      { id: "search", url: "https://www.google.com" },
      { id: "results" },
    ] as const,
    edges: [
      {
        from: "search",
        to: "results",
        name: "search",
        action: () => {},
      },
      {
        from: "results",
        to: "search",
        name: "back home",
        action: () => {},
      },
    ],
    // TODO would be nice to generate this from types
    // TODO allow no resources
    resources: ["temp"],
  },
});
