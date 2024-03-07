import { Cond, UnwrapCond, condIsAnd, evaluateCond } from "./graph.js";
import { states as allStates, edges as allEdges } from "./state.js";
import _ from "lodash";

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
  const startingStates = states.filter((s) => !_.isNil(s.url));
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

const iterLimit = 10;

// Check if all conditional edges have some route from a starting state that
// satisfies their conditions
const naiveSatisfiabilityCheck = (
  states: typeof allStates,
  edges: typeof allEdges
): boolean => {
  type EdgeConditionWithResource = UnwrapCond<
    NonNullable<(typeof edges)[number]["condition"]>
  >;

  const verifyCond = (
    value: number,
    resource: EdgeConditionWithResource["resource"],
    cond: Cond<EdgeConditionWithResource | boolean>
  ): boolean =>
    evaluateCond(cond, (c) => {
      if (_.isBoolean(c)) return c;
      if (c.resource === resource) {
        if (c.operator === "lt") return value < c.value;
        if (c.operator === "gt") return value > c.value;
      }
      return true;
    });

  // `keyBy` doesn't preserve string literals since the input may not contain
  // all possible keys, but all edges are provided here.
  // TODO associate this with the createEdges function
  const nameKeyedEdges = _.keyBy(edges, "name") as Record<
    (typeof edges)[number]["name"],
    (typeof edges)[number]
  >;

  const conditionStrippedEdges = edges.map((edge) => _.omit(edge, "condition"));

  const startingStates = states.filter((s) => !_.isNil(s.url));
  const conditionalEdges = edges.filter((e) => !_.isNil(e.condition));

  _.forEach(conditionalEdges, (conditionalEdge) => {
    const edgeConditionMap: Record<
      (typeof edges)[number]["name"],
      Cond<EdgeConditionWithResource | boolean>
    > = _.mapValues(nameKeyedEdges, (edge) =>
      _.cloneDeep(edge.condition ?? true)
    );

    // for every conditionally traversable edge, backprop condition until one of the following:
    //   - a starting state is reached with a condition that passes with an empty state (succeed)
    //   - if all conditional edges are invalid (fail early)
    //   - there are no edges left to backprop to (fail early)
    //   - some constant number of iterations is reached (fail)

    // backpropagation on edge A is defined as:
    //  - if any edge B points to edge A, edge B's condition becomes its
    //    existing condition AND edge A's condition

    // initialize horizon with conditional edge
    let backpropHorizon = [conditionalEdge];

    _.forEach(_.range(iterLimit), () => {
      // per iteration, generate next horizon
      const newBackpropHorizon = _.uniqBy(
        _.flatMap(backpropHorizon, (backpropHorizonEdge) => {
          // get all edges that point to backpropHorizonEdge
          const backEdges = conditionStrippedEdges.filter(
            (e) => e.to === backpropHorizonEdge.from
          );

          // propagate the condition from backpropHorizonEdge to backEdges
          _.forEach(backEdges, (backEdge) => {
            const backproppedCondition =
              edgeConditionMap[backpropHorizonEdge.name];
            // TODO modify backproppedCondition based on edge effects

            const edgeCondition = edgeConditionMap[backEdge.name];
            edgeConditionMap[backEdge.name] = _.cloneDeep({
              _and: [
                ...(condIsAnd(edgeCondition)
                  ? edgeCondition._and
                  : [edgeCondition]),
                backproppedCondition,
              ],
            });
          });

          return backEdges;
        }),
        "name"
      );

      // TODO filter newBackPropHorizon of any invalid conditions

      // TODO if newBackpropHorizon is empty, fail

      // TODO if newBackpropHorizon contains an edge off of the starting state,
      // and the condition is valid, succeed

      // TODO set backpropHorizon to newBackpropHorizon
    });

    // TODO if iterLimit is reached, fail
  });

  // if every conditional edge has a valid path, return true

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
