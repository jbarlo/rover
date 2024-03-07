import { states as allStates, edges as allEdges } from "./state.js";
import _, { isNil } from "lodash";

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
  type: "prep" | "action" | "cleanup";
}

const wasEdgeTraversed = (edgeName: string, steps: Step[]) =>
  steps.some((step) => step.edgeName === edgeName);

type VisitedStatesRecord = Partial<
  Record<(typeof allStates)[number]["id"], boolean>
>;

// recursively traverses the graph using DFS, scheduling actions and cleanups.
// avoids retreading visited states
const traverseDFS = (
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

    const result = traverseDFS(e, nextState, currVisitedStates);

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

const simpleScheduler = (
  states: typeof allStates,
  edges: typeof allEdges
): Step[] =>
  _.flatMap(edges, (edge) => [
    { edgeName: edge.name, type: "prep" },
    { edgeName: edge.name, type: "action" },
    { edgeName: edge.name, type: "cleanup" },
  ]);

// Check if all states are reachable from starting states
const traversabilityCheck = (
  states: typeof allStates,
  edges: typeof allEdges
) => {
  const startingStates = states.filter((s) => !isNil(s.url));
  if (startingStates.length === 0) return false;

  const stateDict = {
    ..._.mapValues(_.keyBy(states, "id"), () => false),
    ..._.mapValues(_.keyBy(startingStates, "id"), () => true),
  };
  const edgeDict = _.mapValues(_.keyBy(edges, "name"), () => false);
  let edgeHorizon = _.uniqBy(
    _.flatMap(startingStates, (s) => edges.filter((e) => e.from === s.id)),
    "name"
  );

  while (edgeHorizon.length > 0) {
    const newEdgeHorizon: typeof allEdges = _.flatMap(edgeHorizon, (s) => {
      edgeDict[s.name] = true;
      if (!stateDict[s.to]) {
        stateDict[s.to] = true;
        // add outbound edges to edge horizon if not in edge dict
        const outboundEdges = edges.filter(
          (e) => e.from === s.to && !edgeDict[e.name]
        );
        return outboundEdges;
      }
      return [];
    });

    edgeHorizon = _.uniqBy(newEdgeHorizon, "name");
  }

  return _.every(stateDict);
};

const naiveSatisfiabilityCheck = (
  states: typeof allStates,
  edges: typeof allEdges
): boolean => {
  // TODO
  return true;
};

// produce a list of edge action and cleanup steps that trace a path through the graph
const runScheduler = (
  states: typeof allStates,
  edges: typeof allEdges
): Step[] => {
  // for now, run every edge's prep, action, and cleanup
  return simpleScheduler(states, edges);

  // TODO new scheduler
  // determine starting states from urls
  // create implied edges from starting states to all other states
  // ensure all edges are traversable from starting states. conditional edges, etc
  if (traversabilityCheck(states, edges) === false) {
    throw new Error("Some states are unreachable");
  }
  // automatically calculate prep and cleanup paths to resolve effects
  if (naiveSatisfiabilityCheck(states, edges) === false) {
    // TODO actually say what's unsatisfiable
    throw new Error("Some conditions are unsatisfiable");
  }

  // console.log(traverseDFS(edges, states[0]!));
};

const runSteps = (steps: Step[], edges: typeof allEdges) => {
  // run each edge's prep, action, and cleanup -- do snapshotting, etc
  _.forEach(steps, (step) => {
    const edge = edges.find((e) => e.name === step.edgeName)!;
    if (_.isNil(edge)) return true; // continue
    edge[step.type]?.();
  });
};

async function main() {
  parseGraphValidity(allStates, allEdges);

  const steps = runScheduler(allStates, allEdges);

  runSteps(steps, allEdges);
}

main();
