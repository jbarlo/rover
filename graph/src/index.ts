import { Cond, combineCond } from "./cond.js";
import { states as allStates, edges as allEdges, resources } from "./state.js";
import _ from "lodash";
import {
  EdgeConditionWithResource,
  HorizonEdgeCondition,
  backpropagateCondition,
  edgeConditionIsValid,
  prettyPrint,
  simplifyHorizonEdgeCond,
  verifyCond,
} from "./stateCond.js";

const parseGraphValidity = (s: typeof allStates, e: typeof allEdges) => {
  if (s.length !== _.uniqBy(s, "id").length) {
    throw new Error("Duplicate state IDs");
  }

  if (e.length !== _.uniqBy(e, "name").length) {
    throw new Error("Duplicate edge names");
  }

  // TODO check non-start states don't have conflicting implied URLs
  // should URLs and startingness be separate? maybe URLs as groups?x
};

interface Step {
  edgeName: string;
  type: "prep" | "action" | "cleanup";
}

const getStartingStates = (states: typeof allStates) =>
  states.filter((s) => !_.isNil(s.url));

// Check if all states are reachable from starting states
const traversabilityCheck = (
  states: typeof allStates,
  edges: typeof allEdges
) => {
  const startingStates = getStartingStates(states);
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

  const startingStates = getStartingStates(states);
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
          // TODO does the edge name even matter? maybe yes, to calculate
          // alternative paths
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

const getPathFromHorizonEdgeNames = (
  horizons: (typeof allEdges)[number]["name"][][]
): (typeof allEdges)[number]["name"][] => {
  const reversedHorizons = _.reverse(_.cloneDeep(horizons));

  return _.map(reversedHorizons, (horizon) => {
    // TODO track multiple valid routes?
    const validEdge = _.first(horizon);
    if (_.isNil(validEdge)) throw new Error("Horizons not traversable");

    return validEdge;
  });
};

const getPathFromHorizons = (
  edges: typeof allEdges,
  horizons: Horizon[]
): (typeof allEdges)[number]["name"][] => {
  const effectPack: Partial<
    Record<EdgeConditionWithResource["resource"], number>
  > = {};
  const addToPack = (
    resource: EdgeConditionWithResource["resource"],
    value: number | undefined
  ) => {
    effectPack[resource] = (effectPack[resource] ?? 0) + (value ?? 0);
  };

  const reversedHorizons = _.reverse(_.cloneDeep(horizons));

  return _.map(reversedHorizons, (horizon) => {
    const validEdges = _.filter(horizon, (edge) => {
      const cond = edge.condition;
      return (
        _.isNil(cond) ||
        _.every(resources, (r) => verifyCond(effectPack[r] ?? 0, r, cond))
      );
    });
    // TODO track multiple valid routes?
    const validEdge = _.first(validEdges);
    if (_.isNil(validEdge)) throw new Error("Horizons not traversable");

    _.forEach(
      _.find(edges, (e) => e.name === validEdge.name)?.resourceEffects,
      // TODO proper typing
      (val, res) => addToPack(res as EdgeConditionWithResource["resource"], val)
    );

    return validEdge.name;
  });
};

const NONCONDITIONAL_PATH_LIMIT = 10;

const getNonConditionalPaths = (
  states: typeof allStates,
  edges: typeof allEdges,
  conditionalEdgePaths: {
    edgeName: (typeof allEdges)[number]["name"];
    path: ReturnType<typeof getPathFromHorizons>;
  }[]
) => {
  // for every nonconditional edge, determine path to a starting state using
  // conditional edges
  const startingStates = getStartingStates(states);
  const nonConditionalEdges = edges.filter((e) => _.isNil(e.condition));

  const nameKeyedEdges = _.keyBy(edges, "name");

  const conditionalEdgePathsWithEdgeData = _.compact(
    conditionalEdgePaths.map((e) => {
      const edge = nameKeyedEdges[e.edgeName];
      if (_.isNil(edge)) return undefined;
      return { edge, path: e.path };
    })
  );

  const nameKeyedConditionalEdgePaths = _.keyBy(
    conditionalEdgePathsWithEdgeData,
    (e) => e.edge.name
  );

  const nonConditionalEdgePaths = _.map(
    nonConditionalEdges,
    (nonConditionalEdge) => {
      // if nonconditional edge starts at a starting state, return it
      if (_.some(startingStates, (s) => s.id === nonConditionalEdge.from)) {
        return {
          edge: nonConditionalEdge.name,
          path: [nonConditionalEdge.name],
        };
      }

      const conditionalEdgeFound: Partial<
        Record<
          (typeof conditionalEdgePathsWithEdgeData)[number]["edge"]["name"],
          { pathToNonConditional: ReturnType<typeof getPathFromHorizons> }
        >
      > = {};

      let horizons = [[nonConditionalEdge.name]];

      // BFS for NONCONDITIONAL_PATH_LIMIT iterations or break if no more edges to
      // traverse or starting state reached.
      try {
        _.forEach(_.range(NONCONDITIONAL_PATH_LIMIT), (iter) => {
          const newHorizon = _.uniq(
            _.flatMap(horizons[iter], (edgeName) => {
              const edge = nameKeyedEdges[edgeName];
              if (_.isNil(edge)) return [];
              const nextEdges = edges.filter((e) => e.to === edge.from);
              return nextEdges.map((e) => e.name);
            })
          );

          horizons.push(newHorizon);

          if (_.isEmpty(newHorizon)) {
            throw new Error("No more edges to traverse");
          }

          // if horizon contains a conditional edge, store its path
          const horizonEdgeMatrix = _.flatMap(newHorizon, (edgeName) => {
            const horizonEdge = nameKeyedEdges[edgeName];
            if (_.isNil(horizonEdge)) return [];
            return _.map(conditionalEdgePathsWithEdgeData, (e) => ({
              horizonEdge,
              conditionalEdge: e,
            }));
          });
          const matchingConditionalEdge = _.find(
            horizonEdgeMatrix,
            (horizonEdgePair) =>
              horizonEdgePair.horizonEdge.name ===
              horizonEdgePair.conditionalEdge.edge.name
          );
          if (
            !_.isNil(matchingConditionalEdge) &&
            _.isNil(
              conditionalEdgeFound[
                matchingConditionalEdge.conditionalEdge.edge.name
              ]
            )
          ) {
            conditionalEdgeFound[
              matchingConditionalEdge.conditionalEdge.edge.name
            ] = {
              // lop off the head. the coonditional path includes its own edge
              pathToNonConditional: _.tail(
                getPathFromHorizonEdgeNames(horizons)
              ),
            };
          }

          if (
            _.some(newHorizon, (edgeName) => {
              const edge = nameKeyedEdges[edgeName];
              if (_.isNil(edge)) return false;
              return _.some(startingStates, (s) => s.id === edge.from);
            })
          )
            return false; // break if a starting state is reached
        });
      } catch {
        // no more edges to traverse

        // no conditional edge found and no starting state reached
        if (_.filter(conditionalEdgeFound, (v) => !_.isNil(v)).length <= 0) {
          throw new Error(
            "No conditional edge found and no starting state reached"
          );
        }
      }

      // conditional edge found, use the shortest total path
      if (_.filter(conditionalEdgeFound, (v) => !_.isNil(v)).length > 0) {
        const shortestConditionalEdgePath = _.minBy(
          _.compact(
            _.map(conditionalEdgeFound, (val, edgeName) =>
              _.isNil(val)
                ? undefined
                : {
                    edgeName: edgeName as keyof typeof conditionalEdgeFound,
                    pathToNonConditional: val.pathToNonConditional,
                  }
            )
          ),
          (v) =>
            (nameKeyedConditionalEdgePaths[v.edgeName]?.path.length ?? 0) +
            v.pathToNonConditional.length
        );
        if (_.isNil(shortestConditionalEdgePath)) return null;
        const conditionalEdgePath =
          nameKeyedConditionalEdgePaths[shortestConditionalEdgePath.edgeName];
        if (_.isNil(conditionalEdgePath)) return null;
        return {
          edge: nonConditionalEdge.name,
          path: [
            ...conditionalEdgePath.path,
            ...shortestConditionalEdgePath.pathToNonConditional,
          ],
        };
      }

      return {
        edge: nonConditionalEdge.name,
        path: getPathFromHorizonEdgeNames(horizons),
      };
    }
  );

  return _.compact(nonConditionalEdgePaths);
};

// produce a list of edge action and cleanup steps that trace a path through the graph
const runScheduler = (
  states: typeof allStates,
  edges: typeof allEdges
): Step[] => {
  console.log("Running Scheduler");
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
  const conditionalPaths = _.map(satisfiabilityCheckResult, (result) => ({
    edgeName: result.conditionalEdge,
    path: getPathFromHorizons(edges, result.horizons),
  }));

  console.log(JSON.stringify(conditionalPaths));

  console.log("Calculating non-conditional paths");
  const nonConditionalPaths = getNonConditionalPaths(
    states,
    edges,
    conditionalPaths
  );
  console.log(JSON.stringify(nonConditionalPaths));

  // TODO
  return [];
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
