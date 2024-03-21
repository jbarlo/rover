import { ResourceEffects } from "./graph.js";
import {
  Cond,
  UnwrapCond,
  combineCond,
  evaluateCond,
  flattenCond,
  mapCond,
  prettyPrintEdgeCondition,
} from "./cond.js";
import { states as allStates, edges as allEdges, resources } from "./state.js";
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

type EdgeConditionWithResource = UnwrapCond<
  NonNullable<(typeof allEdges)[number]["condition"]>
>;
const prettyPrint = (condition: Cond<EdgeConditionWithResource | boolean>) =>
  prettyPrintEdgeCondition(condition, (c) =>
    _.isBoolean(c)
      ? c.toString()
      : `${c.operator === "gt" ? ">" : "<"} ${c.value} ${c.resource}`
  );

const backpropagateCondition = (
  cond: Cond<EdgeConditionWithResource | boolean>,
  resourceEffects:
    | ResourceEffects<EdgeConditionWithResource["resource"]>
    | undefined
): Cond<EdgeConditionWithResource | boolean> => {
  return mapCond(cond, (c) => {
    if (_.isBoolean(c) || _.isNil(resourceEffects)) return c;
    const resourceEffect: number | undefined = resourceEffects[c.resource];
    if (_.isNil(resourceEffect)) return c;
    return { ...c, value: c.value - resourceEffect };
  });
};

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

const edgeConditionIsValid = (
  cond: Cond<EdgeConditionWithResource | boolean>
): boolean => {
  const flattenedConditions: (EdgeConditionWithResource | boolean)[] =
    flattenCond(cond);

  const sets: Partial<
    Record<EdgeConditionWithResource["resource"], Set<number>>
  > = {};
  const addToSet = (
    resource: EdgeConditionWithResource["resource"],
    value: number
  ) => {
    if (!sets[resource]) sets[resource] = new Set();
    sets[resource]?.add(value);
  };

  _.forEach(flattenedConditions, (c) => {
    if (_.isBoolean(c)) return;
    addToSet(c.resource, c.value);
  });

  try {
    _.forEach(sets, (set, resource) => {
      if (_.isNil(set) || set.size <= 0) return true; // skip empty sets
      const orderedValues = _.sortBy(Array.from(set));
      const shiftedDownByOne = _.map(orderedValues, (v) => v - 1);
      // appease TS with ?? 0. orderedValues always contains at least 1 value
      const finalShiftedUpOne = (_.last(orderedValues) ?? 0) + 1;
      const testValues = _.uniq([
        ...orderedValues,
        ...shiftedDownByOne,
        finalShiftedUpOne,
      ]);

      if (
        _.every(
          testValues,
          (v) =>
            !verifyCond(
              v,
              resource as EdgeConditionWithResource["resource"],
              cond
            )
        )
      ) {
        throw new Error("Invalid condition");
      }
    });
  } catch (e) {
    console.log(cond);
    console.error(e);
    return false;
  }

  return true;
};

const iterLimit = 10;

// Check if all conditional edges have some route from a starting state that
// satisfies their conditions
const naiveSatisfiabilityCheck = (
  states: typeof allStates,
  edges: typeof allEdges
): boolean => {
  // `keyBy` doesn't preserve string literals since the input may not contain
  // all possible keys, but all edges are provided here.
  // TODO associate this with the createEdges function
  const nameKeyedEdges = _.keyBy(edges, "name") as Record<
    (typeof edges)[number]["name"],
    (typeof edges)[number]
  >;

  const conditionStrippedEdges = edges.map((edge) => _.omit(edge, "condition"));

  const startingStates = states.filter((s) => !_.isNil(s.url));
  const conditionalEdges = edges
    .filter((e) => !_.isNil(e.condition))
    .map((edge) => _.omit(edge, "condition"));

  try {
    const initialEdgeConditionMap: Partial<
      Record<
        (typeof edges)[number]["name"],
        Cond<EdgeConditionWithResource | boolean>
      >
    > = _.mapValues(nameKeyedEdges, (edge) => _.cloneDeep(edge.condition));
    _.forEach(conditionalEdges, (conditionalEdge) => {
      // for every conditionally traversable edge, backprop condition until one of the following:
      //   - a starting state is reached with a condition that passes with an empty state (succeed)
      //   - if all conditional edges are invalid (fail early)
      //   - there are no edges left to backprop to (fail early)
      //   - some constant number of iterations is reached (fail)

      // backpropagation on edge A is defined as:
      //  - if any edge B points to edge A, edge B's condition becomes its
      //    existing condition AND edge A's condition

      // initialize horizon with conditional edge
      let backpropHorizon: {
        edge: typeof conditionalEdge;
        condition: Cond<EdgeConditionWithResource | boolean> | undefined;
      }[] = [
        {
          edge: conditionalEdge,
          condition: _.cloneDeep(initialEdgeConditionMap[conditionalEdge.name]),
        },
      ];

      _.forEach(_.range(iterLimit), (iter) => {
        console.log("Iteration: ", iter);
        // per iteration, generate next horizon

        // console.log("Generating next horizon");
        const newBackpropHorizon = _.flatMap(
          backpropHorizon,
          ({
            edge: backpropHorizonEdge,
            condition: backpropHorizonEdgeCondition,
          }) => {
            // console.log("Previous horizon edge: ", backpropHorizonEdge.name);
            // get all edges that point to backpropHorizonEdge
            const backEdges = conditionStrippedEdges.filter(
              (e) => e.to === backpropHorizonEdge.from
            );

            // propagate the condition from backpropHorizonEdge to backEdges
            return _.map(backEdges, (backEdge) => {
              // console.log("Candidate back edge: ", backEdge.name);
              const initialBackEdgeCondition = _.cloneDeep(
                initialEdgeConditionMap[backEdge.name]
              );

              const backproppedCondition = _.isNil(backpropHorizonEdgeCondition)
                ? true
                : backpropagateCondition(
                    backpropHorizonEdgeCondition,
                    backEdge.resourceEffects
                  );

              // for every backEdge,
              // if no condition exists, use the backpropped condition
              // if a condition exists, preserve it and AND it with the backpropped condition

              const backEdgeCondition = _.isNil(initialBackEdgeCondition)
                ? _.cloneDeep(backproppedCondition)
                : // TODO implement simplification for fewer test values
                  combineCond({
                    _and: [initialBackEdgeCondition, backproppedCondition],
                  });

              return { edge: backEdge, condition: backEdgeCondition };
            });
          }
        );

        // filter newBackPropHorizon of any invalid conditions
        const validNewBackpropHorizon = newBackpropHorizon.filter(
          ({ condition }) =>
            _.isNil(condition) || edgeConditionIsValid(condition)
        );

        // if validNewBackpropHorizon contains an edge off of the starting state,
        // (and implicitly the condition is valid), succeed
        if (
          // FIXME inefficient
          _.some(startingStates, (s): boolean =>
            _.some(validNewBackpropHorizon, ({ edge: e, condition: cond }) => {
              return (
                e.from === s.id &&
                !_.isNil(cond) &&
                _.every(resources, (r) => verifyCond(0, r, cond))
              );
            })
          )
        ) {
          console.log("Conditional Edge Succeeded: ", conditionalEdge.name);
          // console.log(
          //   JSON.stringify(
          //     validNewBackpropHorizon.map((h) => ({
          //       ...h,
          //       condition: _.isNil(h.condition)
          //         ? "undefined"
          //         : prettyPrint(h.condition),
          //     }))
          //   )
          // );
          return false; // success, break
        }

        backpropHorizon = validNewBackpropHorizon;

        // if backpropHorizon is empty, fail early
        if (backpropHorizon.length === 0) {
          throw new Error("No more edges to backprop conditions to");
        }

        // if iterLimit is reached, fail
        if (iter >= iterLimit - 1) {
          console.log("Conditional Edge Failed: ", conditionalEdge.name);
          console.log(
            JSON.stringify(
              validNewBackpropHorizon.map((h) => ({
                ...h,
                condition: _.isNil(h.condition)
                  ? "undefined"
                  : prettyPrint(h.condition),
              }))
            )
          );
          throw new Error("Iteration limit reached");
        }
      });
    });
  } catch (e) {
    console.error(e);
    return false;
  }

  // no errors, therefore every conditional edge has a valid path
  return true;
};

// produce a list of edge action and cleanup steps that trace a path through the graph
const runScheduler = (
  states: typeof allStates,
  edges: typeof allEdges
): Step[] => {
  console.log("Running Scheduler");
  // for now, run every edge's prep, action, and cleanup
  // return simpleScheduler(states, edges);

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

  // TODO
  return [];
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
  console.log("Starting");
  try {
    parseGraphValidity(allStates, allEdges);

    const steps = runScheduler(allStates, allEdges);

    runSteps(steps, allEdges);
    console.log("Complete!");
  } catch (e) {
    console.error(e);
  }
}

main();
