import { ResourceEffects } from "./graph.js";
import {
  Cond,
  UnwrapCond,
  combineCond,
  condIsLeaf,
  evaluateCond,
  flattenCond,
  flattenSoloCond,
  mapCond,
  mapCondArr,
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

type HorizonEdgeCondition =
  | Cond<EdgeConditionWithResource | boolean>
  | undefined;

// TODO test
// TODO determine numeric ranges and reconstruct a cond
const simplifyHorizonEdgeCond = (
  cond: HorizonEdgeCondition
): HorizonEdgeCondition => {
  if (_.isNil(cond)) return undefined;

  const combinedCond = combineCond(cond);

  const mappedCond = {
    _and: mapCondArr(
      [combinedCond],
      (conds, parentType) => {
        if (parentType === "and") {
          if (_.some(conds, (c) => c === false)) return [false];
          // defines the highest and lowest valid value boundary for each
          // resource. if a value is defined, values *beyond* that value are
          // valid. if a resource is not defined, all values are valid.
          const bounds: Partial<
            Record<
              EdgeConditionWithResource["resource"],
              { highest: number; lowest: number }
            >
          > = {};
          const setBoundary = (
            resource: EdgeConditionWithResource["resource"],
            type: "high" | "low",
            value: number
          ) => {
            const boundary = _.cloneDeep(bounds[resource]) ?? {
              highest: Infinity,
              lowest: -Infinity,
            };
            if (type === "high") {
              boundary.highest = Math.min(boundary.highest, value);
            } else {
              boundary.lowest = Math.max(boundary.lowest, value);
            }
            bounds[resource] = boundary;
            return boundary;
          };
          try {
            _.forEach(conds, (c) => {
              if (_.isBoolean(c)) return true; // continue
              if (!condIsLeaf(c)) return true; // continue
              const newBoundary = setBoundary(
                c.resource,
                c.operator === "lt" ? "high" : "low",
                c.value
              );
              if (newBoundary.highest <= newBoundary.lowest)
                throw new Error("Invalid cond");
            });
          } catch {
            return [false];
          }

          const newConds: typeof conds = _.compact(
            _.flatMap(
              bounds,
              (
                boundary: (typeof bounds)[keyof typeof bounds],
                resource: keyof typeof bounds
              ) => {
                if (_.isNil(boundary)) return undefined;

                const lowerBound =
                  boundary.lowest > -Infinity
                    ? { resource, value: boundary.lowest, operator: "gt" }
                    : undefined;
                const upperBound =
                  boundary.highest < Infinity
                    ? { resource, value: boundary.highest, operator: "lt" }
                    : undefined;

                return [lowerBound, upperBound];
              }
            )
          );

          return [..._.filter(conds, (c) => !condIsLeaf(c)), ...newConds];
        }

        if (_.some(conds, (c) => c === true)) return [true];
        // defines the highest and lowest valid value boundary for each
        // resource. all values *outside* of that boundary are valid. if a
        // resource is not defined, no values are valid.
        const bounds: Partial<
          Record<
            EdgeConditionWithResource["resource"],
            { highest: number; lowest: number }
          >
        > = {};
        const setBoundary = (
          resource: EdgeConditionWithResource["resource"],
          type: "high" | "low",
          value: number
        ) => {
          const boundary = _.cloneDeep(bounds[resource]) ?? {
            highest: Infinity,
            lowest: -Infinity,
          };
          if (type === "high") {
            boundary.highest = Math.min(boundary.highest, value);
          } else {
            boundary.lowest = Math.max(boundary.lowest, value);
          }
          bounds[resource] = boundary;
          return boundary;
        };
        try {
          _.forEach(conds, (c) => {
            if (_.isBoolean(c)) return true; // continue
            if (!condIsLeaf(c)) return true; // continue
            const newBoundary = setBoundary(
              c.resource,
              c.operator === "lt" ? "high" : "low",
              c.value
            );
            if (newBoundary.highest <= newBoundary.lowest)
              throw new Error("Tautology found");
          });
        } catch {
          return [true];
        }

        const newConds: typeof conds = _.compact(
          _.flatMap(
            bounds,
            (
              boundary: (typeof bounds)[keyof typeof bounds],
              resource: keyof typeof bounds
            ) => {
              if (_.isNil(boundary)) return undefined;

              const lowerBound =
                boundary.lowest > -Infinity
                  ? { resource, value: boundary.lowest, operator: "lt" }
                  : undefined;
              const upperBound =
                boundary.highest < Infinity
                  ? { resource, value: boundary.highest, operator: "gt" }
                  : undefined;

              return [lowerBound, upperBound];
            }
          )
        );

        return [..._.filter(conds, (c) => !condIsLeaf(c)), ...newConds];
      },
      "and",
      true
    ),
  };

  return flattenSoloCond(mappedCond);
};

// Check if all conditional edges have some route from a starting state that
// satisfies their conditions
type Horizon = {
  name: (typeof allEdges)[number]["name"];
  condition: HorizonEdgeCondition;
}[];
const naiveSatisfiabilityCheck = (
  states: typeof allStates,
  edges: typeof allEdges
):
  | {
      conditionalEdge: (typeof allEdges)[number]["name"];
      horizons: Horizon[];
    }[]
  | false => {
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
    const everyConditionalEdgesHorizons = _.map<
      (typeof conditionalEdges)[number],
      {
        conditionalEdge: (typeof conditionalEdges)[number]["name"];
        horizons: Horizon[];
      }
    >(conditionalEdges, (conditionalEdge) => {
      // for every conditionally traversable edge, backprop condition until one of the following:
      //   - a starting state is reached with a condition that passes with an empty state (succeed)
      //   - if all conditional edges are invalid (fail early)
      //   - there are no edges left to backprop to (fail early)
      //   - some constant number of iterations is reached (fail)

      // backpropagation on edge A is defined as:
      //  - if any edge B points to edge A, edge B's condition becomes its
      //    existing condition AND edge A's condition

      // initialize horizon with conditional edge
      type HorizonEdge = {
        edge: typeof conditionalEdge;
        condition: HorizonEdgeCondition;
      };
      // TODO make prettyPrint condition order deterministic
      const serializeHorizonEdge = (edge: HorizonEdge): string =>
        `${edge.edge.name}:${
          _.isNil(edge.condition) ? undefined : prettyPrint(edge.condition)
        }`;
      let backpropHorizon: HorizonEdge[] = [
        {
          edge: conditionalEdge,
          condition: _.cloneDeep(initialEdgeConditionMap[conditionalEdge.name]),
        },
      ];

      const allHorizons: Horizon[] = [
        _.map(backpropHorizon, (h) => ({
          name: h.edge.name,
          condition: h.condition,
        })),
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
                : // TODO if all backpropped conditions subsumed by edge's initial
                  // condition, consider a DP approach

                  // TODO implement simplification for fewer test values
                  combineCond({
                    _and: [initialBackEdgeCondition, backproppedCondition],
                  });

              return {
                edge: backEdge,
                condition: simplifyHorizonEdgeCond(backEdgeCondition),
              };
            });
          }
        );

        // filter newBackPropHorizon of any invalid conditions
        const validNewBackpropHorizon = _.uniqBy(
          newBackpropHorizon.filter(
            ({ condition }) =>
              _.isNil(condition) || edgeConditionIsValid(condition)
          ),
          (h) => serializeHorizonEdge(h)
        );

        // if validNewBackpropHorizon contains an edge off of the starting state,
        // (and implicitly the condition is valid), succeed
        const thing = ({ edge: e, condition: cond }: HorizonEdge) =>
          _.some(
            startingStates,
            (s): boolean =>
              e.from === s.id &&
              !_.isNil(cond) &&
              _.every(resources, (r) => verifyCond(0, r, cond))
          );
        if (
          // FIXME inefficient
          _.some(validNewBackpropHorizon, (horizonEdge) => thing(horizonEdge))
        ) {
          console.log("Conditional Edge Succeeded: ", conditionalEdge.name);

          // record edges that are off of starting states and have valid
          // conditions
          allHorizons.push(
            _.map(
              _.filter(validNewBackpropHorizon, (horizonEdge) =>
                thing(horizonEdge)
              ),
              (h) => ({ name: h.edge.name, condition: h.condition })
            )
          );
          return false; // success, break
        }

        backpropHorizon = validNewBackpropHorizon;
        allHorizons.push(
          _.map(validNewBackpropHorizon, (h) => ({
            name: h.edge.name,
            condition: h.condition,
          }))
        );

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

      return { conditionalEdge: conditionalEdge.name, horizons: allHorizons };
    });

    // no errors, therefore every conditional edge has a valid path
    return everyConditionalEdgesHorizons;
  } catch (e) {
    console.error(e);
    return false;
  }
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
  const satisfiabilityCheckResult = naiveSatisfiabilityCheck(states, edges);
  if (satisfiabilityCheckResult === false) {
    // TODO actually say what's unsatisfiable
    throw new Error("Some conditions are unsatisfiable");
  }
  console.log(JSON.stringify(satisfiabilityCheckResult));

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
