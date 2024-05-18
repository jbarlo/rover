import { configure } from "./src/configuration.js";

// TODO possible configs:
//  - gte/lte
//  - nonnegative resource? all edges with that resource in the condition gets
//    anded with >=0?

export default configure({
  graph: {
    // TODO ensure unique IDs
    states: [
      { id: "1" as const },
      { id: "2" as const, url: "start" },
      { id: "3" as const },
    ] as const,
    edges: [
      {
        from: "1",
        to: "1",
        name: "1-self-loop-x2",
        resourceEffects: { apples: 2 },
        condition: { resource: "apples", value: 4, operator: "gt" },
        action: () => {
          console.log("1-self-loop-x2");
        },
      },
      {
        from: "1",
        to: "1",
        name: "1-self-loop",
        resourceEffects: { apples: 1 },
        action: () => {
          console.log("1-self-loop");
        },
      },
      {
        from: "1",
        to: "2",
        name: "go-to-2",
        condition: { resource: "apples", value: 14, operator: "gt" },
        action: () => {
          console.log("go-to-2");
        },
      },
      {
        from: "1",
        to: "3",
        name: "go-to-3-from-1",
        action: () => {
          console.log("go-to-3-from-1");
        },
      },
      {
        from: "2",
        to: "3",
        name: "go-to-3-from-2",
        action: () => {
          console.log("go-to-3-from-2");
        },
      },
      {
        from: "3",
        to: "1",
        name: "go-to-1-from-3",
        resourceEffects: { apples: -5 },
        action: () => {
          console.log("go-to-1-from-3");
        },
      },
    ],
    // TODO would be nice to generate this from types
    resources: ["apples" as const, "bananas" as const],
  },
});
