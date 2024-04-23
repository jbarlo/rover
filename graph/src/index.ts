import { Cond, combineCond } from "./cond.js";
import {
  states as allStates,
  edges as allEdges,
  resources as allResources,
} from "./state.js";
import _ from "lodash";
import {
  EdgeConditionWithResource,
  HorizonEdgeCondition,
  edgeConditionIsSatisfiable,
  prettyPrint,
  propagateCondition,
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

const bfs = <T>(
  iterLimit: number,
  initialHorizon: T[],
  getNextHorizon: (
    horizon: T[]
  ) =>
    | { endWithoutChecking?: false; horizon: T[] }
    | { endWithoutChecking: true; horizon: T[] },
  // return false to stop iteration
  performChecks?: (newHorizon: T[], horizons: T[][], iter: number) => boolean
): T[][] => {
  const horizons: T[][] = [_.cloneDeep(initialHorizon)];
  _.forEach(_.range(iterLimit), (iter) => {
    const currHorizon = horizons[iter];
    if (_.isNil(currHorizon)) throw new Error("Current horizon wasn't found");
    const newHorizonResult = getNextHorizon(currHorizon);
    horizons.push(newHorizonResult.horizon);

    if (newHorizonResult.endWithoutChecking) return false; // break

    if (_.isEmpty(newHorizonResult)) {
      throw new Error("No more edges to traverse");
    }

    if (!_.isNil(performChecks)) {
      const checkResult = performChecks(
        newHorizonResult.horizon,
        horizons,
        iter
      );
      if (!checkResult) return false;
    }
  });

  return horizons;
};

type ConditionalPropagationBfsHorizonEdge = {
  edge: Pick<
    (typeof allEdges)[number],
    "name" | "resourceEffects" | "to" | "from"
  >;
  condition: HorizonEdgeCondition;
};
const conditionalPropagationBfs = (
  edges: typeof allEdges,
  iterLimit: number,
  initialHorizon: ConditionalPropagationBfsHorizonEdge[],
  getEdgeNeighbours: (
    edge: (typeof allEdges)[number]
  ) => Pick<
    (typeof allEdges)[number],
    "name" | "resourceEffects" | "to" | "from"
  >[],
  resourceEffectEvaluator: (packValue: number, effectValue: number) => number,
  propagatedNextHorizonValidityPredicate: (
    horizonElement: ConditionalPropagationBfsHorizonEdge
  ) => boolean,
  // if any horizon element passes, succeed. passing results become the final
  // horizon
  successPredicate: (edge: ConditionalPropagationBfsHorizonEdge) => boolean,
  // if defined, filters by valid conditions before they are propagated
  unpropagatedConditionPredicate?: (condition: HorizonEdgeCondition) => boolean
) => {
  const nameKeyedEdges = _.keyBy(edges, "name");
  const initialEdgeConditionMap: Partial<
    Record<
      (typeof edges)[number]["name"],
      Cond<EdgeConditionWithResource | boolean>
    >
  > = _.mapValues(nameKeyedEdges, (edge) => _.cloneDeep(edge.condition));

  // TODO make prettyPrint condition order deterministic
  const serializeHorizonEdge = (
    edge: ConditionalPropagationBfsHorizonEdge
  ): string =>
    `${edge.edge.name}:${
      _.isNil(edge.condition) ? undefined : prettyPrint(edge.condition)
    }`;

  // for every conditionally traversable edge, propagate condition until one of
  // the following:
  //   - a horizon element meets the success criteria (succeed)
  //   - if all conditional edges are invalid (fail early)
  //   - there are no edges left to propagate to (fail early)
  //   - some constant number of iterations is reached (fail)

  // propagation on edge A is defined as:
  //  - if any edge B directionally neighbours edge A, edge B's condition
  //    becomes its existing condition AND edge A's condition

  return bfs<ConditionalPropagationBfsHorizonEdge>(
    iterLimit,
    initialHorizon,
    (prev) => {
      const nextHorizon = _.flatMap(
        prev,
        ({
          edge: { name: prevHorizonEdgeName },
          condition: prevHorizonEdgeCondition,
        }) => {
          const prevHorizonEdge = nameKeyedEdges[prevHorizonEdgeName];
          if (_.isNil(prevHorizonEdge)) return [];

          // get all edges that are directional neighbours to prevHorizonEdge
          const neighbours = getEdgeNeighbours(prevHorizonEdge);

          // propagate the condition from prevHorizonEdge to neighbours
          return _.compact(
            _.map(neighbours, (neighbourEdge) => {
              const initialEdgeCondition =
                _.cloneDeep(initialEdgeConditionMap[neighbourEdge.name]) ??
                true;

              if (
                !_.isNil(unpropagatedConditionPredicate) &&
                !unpropagatedConditionPredicate(
                  simplifyHorizonEdgeCond(
                    combineCond({
                      _and: [
                        initialEdgeCondition,
                        prevHorizonEdgeCondition ?? true,
                      ],
                    })
                  )
                )
              ) {
                return null;
              }

              const propagatedCondition = propagateCondition(
                prevHorizonEdgeCondition ?? true,
                neighbourEdge.resourceEffects,
                resourceEffectEvaluator
              );

              // for every neighbour,
              // if no condition exists, use only the propped condition
              //    (true && propped condition)
              // if a condition exists, preserve it and AND it with the backpropped condition
              //    (existing condition && propped condition)

              const totalCondition =
                // TODO if all propped conditions subsumed by edge's initial
                // condition, consider a DP approach

                // TODO implement simplification for fewer test values
                combineCond({
                  _and: [initialEdgeCondition, propagatedCondition],
                });

              return {
                edge: neighbourEdge,
                condition: simplifyHorizonEdgeCond(totalCondition),
              };
            })
          );
        }
      );

      // filter newBackPropHorizon of any invalid conditions
      const validNextHorizon = _.uniqBy(
        nextHorizon.filter(propagatedNextHorizonValidityPredicate),
        // TODO does the edge name even matter? maybe yes, to calculate
        // alternative paths
        (h) => serializeHorizonEdge(h)
      );

      // if successPredicate passes, succeed 🤯
      if (
        // FIXME inefficient
        _.some(validNextHorizon, (horizonEdge) => successPredicate(horizonEdge))
      ) {
        console.log("Conditional Edge Succeeded");

        return {
          endWithoutChecking: true,
          // record edges that are off of starting states and have valid
          // conditions
          horizon: _.filter(validNextHorizon, (horizonEdge) =>
            successPredicate(horizonEdge)
          ),
        };
      }

      return { horizon: validNextHorizon };
    },
    (newHorizon, horizons, iter) => {
      // if iterLimit is reached, fail
      if (iter >= iterLimit - 1) {
        console.log("Conditional Edge Failed");
        console.log(
          JSON.stringify(
            _.map(newHorizon, (h) => ({
              ...h,
              condition: _.isNil(h.condition)
                ? "undefined"
                : prettyPrint(h.condition),
            }))
          )
        );
        throw new Error("Iteration limit reached");
      }

      return true;
    }
  );
};

const CONDITIONAL_ITER_LIMIT = 10;

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
  const initialEdgeConditionMap: Partial<
    Record<
      (typeof edges)[number]["name"],
      Cond<EdgeConditionWithResource | boolean>
    >
  > = _.mapValues(nameKeyedEdges, (edge) => _.cloneDeep(edge.condition));

  const startingStates = getStartingStates(states);
  const conditionalEdges = edges.filter((e) => !_.isNil(e.condition));

  try {
    const everyConditionalEdgesHorizons = _.map<
      (typeof conditionalEdges)[number],
      {
        conditionalEdge: (typeof conditionalEdges)[number]["name"];
        horizons: Horizon[];
      }
    >(conditionalEdges, (conditionalEdge) => {
      // initialize horizon with conditional edge
      const initialBackpropHorizon: ConditionalPropagationBfsHorizonEdge[] = [
        {
          edge: conditionalEdge,
          condition: _.cloneDeep(initialEdgeConditionMap[conditionalEdge.name]),
        },
      ];

      const allHorizons = conditionalPropagationBfs(
        edges,
        CONDITIONAL_ITER_LIMIT,
        initialBackpropHorizon,
        (neighbour) => edges.filter((e) => e.to === neighbour.from),
        (packValue, effectValue) => packValue - effectValue,
        ({ condition }) =>
          _.isNil(condition) || edgeConditionIsSatisfiable(condition),
        ({ edge: e, condition: cond }) =>
          // if validNewBackpropHorizon contains an edge off of the starting
          // state, (and implicitly the condition is valid), succeed
          _.some(
            startingStates,
            (s): boolean =>
              e.from === s.id &&
              !_.isNil(cond) &&
              _.every(allResources, (r) => verifyCond(0, r, cond))
          )
      );

      return {
        conditionalEdge: conditionalEdge.name,
        horizons: _.map(allHorizons, (horizon) =>
          _.map(horizon, (h) => ({
            name: h.edge.name,
            condition: h.condition,
          }))
        ),
      };
    });

    // no errors, therefore every conditional edge has a valid path
    return everyConditionalEdgesHorizons;
  } catch (e) {
    console.error(e);
    return false;
  }
};

// TODO!! usage is sus. confirm filters are correct
const getPathFromHorizonEdgeNames = (
  horizons: (typeof allEdges)[number]["name"][][],
  horizonEdgeFilter: (
    horizon: (typeof allEdges)[number]["name"]
  ) => boolean = () => true
): (typeof allEdges)[number]["name"][] => {
  const reversedHorizons = _.reverse(_.cloneDeep(horizons));

  return _.map(reversedHorizons, (horizon) => {
    const filteredHorizon = horizon.filter(horizonEdgeFilter);
    // TODO track multiple valid routes?
    const validEdge = _.first(filteredHorizon);
    if (_.isNil(validEdge)) throw new Error("Horizons not traversable");

    return validEdge;
  });
};

const traceValidPathThroughHorizons = (
  edges: typeof allEdges,
  horizons: Horizon[],
  updatePackTo: (packValue: number, effectValue: number) => number
): (typeof allEdges)[number]["name"][] => {
  const effectPack: Partial<
    Record<EdgeConditionWithResource["resource"], number>
  > = {};
  const addToPack = (
    resource: EdgeConditionWithResource["resource"],
    value: number | undefined
  ) => {
    effectPack[resource] = updatePackTo(effectPack[resource] ?? 0, value ?? 0);
  };

  const reversedHorizons = _.reverse(_.cloneDeep(horizons));

  return _.map(reversedHorizons, (horizon) => {
    const validEdges = _.filter(horizon, (edge) => {
      const cond = edge.condition;
      return (
        _.isNil(cond) ||
        _.every(allResources, (r) => verifyCond(effectPack[r] ?? 0, r, cond))
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
    path: ReturnType<typeof traceValidPathThroughHorizons>;
  }[]
): {
  edgeName: (typeof allEdges)[number]["name"];
  path: ReturnType<typeof traceValidPathThroughHorizons>;
}[] => {
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
          edgeName: nonConditionalEdge.name,
          path: [nonConditionalEdge.name],
        };
      }

      const conditionalEdgeFound: Partial<
        Record<
          (typeof conditionalEdgePathsWithEdgeData)[number]["edge"]["name"],
          {
            pathToNonConditional: ReturnType<
              typeof traceValidPathThroughHorizons
            >;
          }
        >
      > = {};

      const checkHorizonForConditionalEdge = (
        horizon: (typeof nonConditionalEdge.name)[]
      ) => {
        const horizonEdgeMatrix = _.flatMap(horizon, (edgeName) => {
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

        return _.isNil(matchingConditionalEdge)
          ? undefined
          : matchingConditionalEdge.conditionalEdge.edge.name;
      };

      let allHorizons: (typeof nonConditionalEdge.name)[][] = [];

      // BFS for NONCONDITIONAL_PATH_LIMIT iterations or break if no more edges to
      // traverse or starting state reached.
      try {
        allHorizons = bfs(
          NONCONDITIONAL_PATH_LIMIT,
          [nonConditionalEdge.name],
          (prev) => ({
            horizon: _.uniq(
              _.flatMap(prev, (edgeName) => {
                const edge = nameKeyedEdges[edgeName];
                if (_.isNil(edge)) return [];
                const backEdges = edges.filter((e) => e.to === edge.from);
                return backEdges.map((e) => e.name);
              })
            ),
          }),
          (newHorizon, horizons, iter) => {
            // if horizon contains a conditional edge, store its path
            const conditionalEdgeName =
              checkHorizonForConditionalEdge(newHorizon);
            if (
              !_.isNil(conditionalEdgeName) &&
              _.isNil(conditionalEdgeFound[conditionalEdgeName])
            ) {
              conditionalEdgeFound[conditionalEdgeName] = {
                // lop off the head. the conditional path includes its own edge
                pathToNonConditional: _.tail(
                  // TODO confirm no filtering is needed here
                  getPathFromHorizonEdgeNames(horizons)
                ),
              };
            }

            // break if a starting state is reached
            if (
              _.some(newHorizon, (edgeName) => {
                const edge = nameKeyedEdges[edgeName];
                if (_.isNil(edge)) return false;
                return _.some(startingStates, (s) => s.id === edge.from);
              })
            ) {
              return false;
            }

            return true; // continue
          }
        );
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
      if (!_.isEmpty(_.filter(conditionalEdgeFound, (v) => !_.isNil(v)))) {
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
          edgeName: nonConditionalEdge.name,
          path: [
            ...conditionalEdgePath.path,
            ...shortestConditionalEdgePath.pathToNonConditional,
          ],
        };
      }

      return {
        edgeName: nonConditionalEdge.name,
        // TODO confirm no filtering is needed here
        path: getPathFromHorizonEdgeNames(allHorizons),
      };
    }
  );

  return _.compact(nonConditionalEdgePaths);
};

const getPackFromPath = (
  path: (typeof allEdges)[number]["name"][],
  edges: typeof allEdges,
  initialPack?: Partial<Record<EdgeConditionWithResource["resource"], number>>
): Record<EdgeConditionWithResource["resource"], number> => {
  const pack: Partial<Record<EdgeConditionWithResource["resource"], number>> =
    initialPack ?? {};

  const addToPack = (
    resourceEffect: (typeof edges)[number]["resourceEffects"]
  ) => {
    if (_.isNil(resourceEffect)) return;
    _.forEach(resourceEffect, (val, res) => {
      pack[res as EdgeConditionWithResource["resource"]] =
        (pack[res as EdgeConditionWithResource["resource"]] ?? 0) + (val ?? 0);
    });
  };

  const nameKeyedEdges = _.keyBy(edges, "name");

  _.forEach(path, (edgeName) => {
    const edge = nameKeyedEdges[edgeName];
    if (_.isNil(edge)) throw new Error("Edge not found");
    addToPack(edge.resourceEffects);
  });

  // TODO real types
  const zeroedResources: Record<EdgeConditionWithResource["resource"], number> =
    _.mapValues(_.keyBy(allResources), () => 0) as Record<
      EdgeConditionWithResource["resource"],
      number
    >;

  return { ...zeroedResources, ...pack };
};

const packToCondition = (
  pack: Required<ReturnType<typeof getPackFromPath>>
): Cond<EdgeConditionWithResource> => ({
  _and: _.flatMap<typeof pack, Cond<EdgeConditionWithResource>>(
    pack,
    (val, resource) => {
      if (_.isNil(val)) return [];
      return [
        {
          resource: resource as keyof typeof pack,
          value: val - 1,
          operator: "gt",
        },
        {
          resource: resource as keyof typeof pack,
          value: val + 1,
          operator: "lt",
        },
      ];
    }
  ),
});

const CONDITIONAL_CLEANUP_ITER_LIMIT = 10;

const getCleanupPath = (
  edges: typeof allEdges,
  edgeToClean: (typeof allEdges)[number]["name"],
  pack: Required<ReturnType<typeof getPackFromPath>>
  // false or cleanup path
): false | (typeof allEdges)[number]["name"][] => {
  const initialEdge: ConditionalPropagationBfsHorizonEdge["edge"] | undefined =
    _.find(edges, (e) => e.name === edgeToClean);

  if (_.isNil(initialEdge)) throw new Error("Edge not found");

  const initialCond = packToCondition(pack);

  const condIsSuccessful = (cond: HorizonEdgeCondition) =>
    !_.isNil(cond) && _.every(allResources, (r) => verifyCond(0, r, cond));

  if (condIsSuccessful(initialCond)) return []; // done early!

  const initialBackpropHorizon: ConditionalPropagationBfsHorizonEdge[] = [
    { edge: initialEdge, condition: initialCond },
  ];

  const unpropagatedConditionPredicate = (condition: HorizonEdgeCondition) =>
    _.isNil(condition) ||
    (_.isBoolean(condition) && condition) ||
    (!_.isBoolean(condition) && edgeConditionIsSatisfiable(condition));

  try {
    const allHorizons = conditionalPropagationBfs(
      edges,
      CONDITIONAL_CLEANUP_ITER_LIMIT,
      initialBackpropHorizon,
      (neighbour) => edges.filter((e) => e.from === neighbour.to),
      (packValue, effectValue) => packValue + effectValue,
      () => true,
      // if validNewHorizon contains a 0-pack, succeed
      ({ condition: cond }) => condIsSuccessful(cond),
      unpropagatedConditionPredicate
    );

    return _.reverse(
      traceValidPathThroughHorizons(
        edges,
        // ignore first element since it's the edge to clean
        _.tail(allHorizons).map((horizon) =>
          horizon.map((edge) => ({
            name: edge.edge.name,
            condition: edge.condition,
          }))
        ),
        (packValue, effectValue) => packValue - effectValue
      )
    );
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
    path: traceValidPathThroughHorizons(
      edges,
      result.horizons,
      (packValue, effectValue) => packValue + effectValue
    ),
  }));

  console.log(JSON.stringify(conditionalPaths));

  console.log("Calculating non-conditional paths");
  const nonConditionalPaths = getNonConditionalPaths(
    states,
    edges,
    conditionalPaths
  );
  console.log(JSON.stringify(nonConditionalPaths));

  console.log(
    JSON.stringify(
      _.map(nonConditionalPaths, (path) => getPackFromPath(path.path, edges))
    )
  );

  // TODO effectful implicit nav edges: add all implicit state -> starting state
  // edges to calculate complete paths

  const cleanupPaths = _.map(
    [...conditionalPaths, ...nonConditionalPaths],
    (path, i) => {
      return {
        edgeName: path.edgeName,
        // drop last path element since it's the edge to clean
        preparationPath: _.initial(path.path),
        cleanupPath: getCleanupPath(
          edges,
          path.edgeName,
          getPackFromPath(path.path, edges)
        ),
      };
    }
  );

  console.log(JSON.stringify(cleanupPaths));

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
