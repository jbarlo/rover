import { createEdges, createStates } from "./graph.js";

// TODO ensure unique IDs
export const states = createStates([
  { id: "1" },
  { id: "2", url: "start" },
  { id: "3" },
]);

// TODO possible configs:
//  - gte/lte
//  - nonnegative resource? all edges with that resource in the condition gets
//    anded with >=0?

// TODO would be nice to generate this from types
export const resources = ["apples" as const, "bananas" as const];

export const edges = createEdges(
  [
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
  states,
  resources
);
