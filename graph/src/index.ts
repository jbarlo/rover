import { Edges, createStates } from "./states.js";
import _ from "lodash";

const allStates = createStates([
  { id: "1" },
  { id: "1-1" },
  { id: "1-2" },
  { id: "1-2-1" },
  { id: "1-2-1-1" },
  { id: "1-2-2" },
]);

const allEdges: Edges<typeof allStates> = [
  { from: "1", to: "1-1", name: "go-to-1-1", action: () => {} },
  {
    from: "1-2",
    to: "1-2",
    name: "1-2-self-loop",
    action: () => {},
    cleanup: () => {},
  },
  {
    from: "1",
    to: "1-2",
    name: "go-to-1-2",
    action: () => {},
    cleanup: () => {},
  },
  {
    from: "1-2",
    to: "1-2-1",
    name: "go-to-1-2-1",
    action: () => {},
    cleanup: () => {},
  },
  {
    from: "1-2-1",
    to: "1-2-1-1",
    name: "go-to-1-2-1-1",
    action: () => {},
    cleanup: () => {},
  },
  {
    from: "1-2",
    to: "1-2-2",
    name: "go-to-1-2-2",
    action: () => {},
    cleanup: () => {},
  },
  {
    from: "1",
    to: "1-2-2",
    name: "sneak-to-1-2-2",
    action: () => {},
    cleanup: () => {},
  },
];

const parseGraphValidity = (s: typeof allStates, e: typeof allEdges) => {
  if (s.length !== _.uniqBy(s, "id").length) {
    throw new Error("Duplicate state IDs");
  }

  if (e.length !== _.uniqBy(e, "name").length) {
    throw new Error("Duplicate edge names");
  }
};

const findAssociatedEdges = (
  s: (typeof allStates)[number],
  edges: typeof allEdges
) => edges.filter((edge) => edge.from === s.id);

const findState = (
  id: (typeof allStates)[number]["id"],
  states: typeof allStates
  // id is guaranteed to exist
) => states.find((s) => s.id === id)!;

interface Step {
  edgeName: string;
  type: "action" | "cleanup";
}

const wasEdgeTraversed = (edgeName: string, steps: Step[]) =>
  steps.some((step) => step.edgeName === edgeName);

type VisitedStatesRecord = Partial<
  Record<(typeof allStates)[number]["id"], boolean>
>;

const traverseEdgesFromState = (
  e: typeof allEdges,
  state: (typeof allStates)[number],
  visitedStates: VisitedStatesRecord = {}
): { steps: Step[]; visitedStates: VisitedStatesRecord } => {
  const edges = findAssociatedEdges(state, e);
  let currVisitedStates: Partial<
    Record<(typeof allStates)[number]["id"], boolean>
  > = { ...visitedStates, [state.id]: true };

  const currSteps = _.flatMap(edges, (edge) => {
    if (
      // TODO every edge should be traversed once
      // wasEdgeTraversed(edge.name, steps) &&
      currVisitedStates[edge.to]
    )
      return []; // already visited, skip
    const nextState = findState(edge.to, allStates);

    const result = traverseEdgesFromState(e, nextState, currVisitedStates);

    const toReturn = [
      { edgeName: edge.name, type: "action" as const },
      ...result.steps,
      { edgeName: edge.name, type: "cleanup" as const },
    ];

    // track visited states per sibling
    _.forEach(
      toReturn.filter((step) => step.type === "action"),
      (step) => {
        const edge = edges.find((e) => e.name === step.edgeName);
        currVisitedStates = {
          ...currVisitedStates,
          ...result.visitedStates,
          ...(edge ? { [edge.to]: true } : {}),
        };
      }
    );

    return toReturn;
  });

  return { steps: currSteps, visitedStates: currVisitedStates };
};

// produce a list of edge action and cleanup steps that trace a path through the graph
const runScheduler = (states: typeof allStates, edges: typeof allEdges) => {
  // determine good starting state(s) by finding tributaries

  const state = states[0]!; // TODO

  console.log(traverseEdgesFromState(edges, state));
};

async function main() {
  parseGraphValidity(allStates, allEdges);

  runScheduler(allStates, allEdges);
}

main();
