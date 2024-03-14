import { Edges, createEdges, createStates } from "./graph.js";

export const states = createStates([
  { id: "1" },
  { id: "1-1" },
  { id: "1-2" },
  { id: "1-2-1" },
  { id: "1-2-1-1" },
  { id: "1-2-2" },
]);

// TODO would be nice to generate this from types
export const resources = ["apples" as const, "bananas" as const];

export const edges = createEdges(
  [
    { from: "1", to: "1-1", name: "go-to-1-1", action: () => {} },
    {
      from: "1-2",
      to: "1-2",
      name: "1-2-self-loop",
      // condition: { resource: "apples", value: 5, operator: "lt" },
      // condition: { or: [{ resource: "apples", value: 5, operator: "lt" }] },
      prep: () => {
        console.log("prep 1-2-self-loop");
      },
      action: () => {
        console.log("1-2-self-loop");
      },
      cleanup: () => {
        console.log("cleanup 1-2-self-loop");
      },
    },
    {
      from: "1",
      to: "1-2",
      name: "go-to-1-2",
      prep: () => {
        console.log("prep go-to-1-2");
      },
      action: () => {
        console.log("go-to-1-2");
      },
      cleanup: () => {
        console.log("cleanup go-to-1-2");
      },
    },
    {
      from: "1-2",
      to: "1-2-1",
      name: "go-to-1-2-1",
      prep: () => {
        console.log("prep go-to-1-2-1");
      },
      action: () => {
        console.log("go-to-1-2-1");
      },
      cleanup: () => {
        console.log("cleanup go-to-1-2-1");
      },
    },
    {
      from: "1-2-1",
      to: "1-2-1-1",
      name: "go-to-1-2-1-1",
      prep: () => {
        console.log("prep go-to-1-2-1-1");
      },
      action: () => {
        console.log("go-to-1-2-1-1");
      },
      cleanup: () => {
        console.log("cleanup go-to-1-2-1-1");
      },
    },
    {
      from: "1-2",
      to: "1-2-2",
      name: "go-to-1-2-2",
      prep: () => {
        console.log("prep go-to-1-2-2");
      },
      action: () => {
        console.log("go-to-1-2-2");
      },
      cleanup: () => {
        console.log("cleanup go-to-1-2-2");
      },
    },
    {
      from: "1",
      to: "1-2-2",
      name: "sneak-to-1-2-2",
      prep: () => {
        console.log("prep sneak-to-1-2-2");
      },
      action: () => {
        console.log("sneak-to-1-2-2");
      },
      cleanup: () => {
        console.log("cleanup sneak-to-1-2-2");
      },
    },
  ],
  states,
  resources
);
