import { Edges, createStates } from "./graph.js";

export const states = createStates([
  { id: "1" },
  { id: "1-1" },
  { id: "1-2" },
  { id: "1-2-1" },
  { id: "1-2-1-1" },
  { id: "1-2-2" },
]);

export const edges: Edges<typeof states> = [
  { from: "1", to: "1-1", name: "go-to-1-1", action: () => {} },
  {
    from: "1-2",
    to: "1-2",
    name: "1-2-self-loop",
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
];
