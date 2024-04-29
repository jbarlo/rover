import { Cond, combineCond } from "./cond.js";
import _ from "lodash";
import {
  HorizonEdgeCondition,
  edgeConditionIsSatisfiable,
  prettyPrint,
  propagateCondition,
  simplifyHorizonEdgeCond,
  verifyCond,
} from "./stateCond.js";
import {
  CONDITIONAL_CLEANUP_ITER_LIMIT,
  CONDITIONAL_ITER_LIMIT,
  NONCONDITIONAL_PATH_LIMIT,
} from "./constants.js";
import { EdgeCondition, Edges, Graph, State } from "./graph.js";

const getStartingStates = <StateId extends string, S extends State<StateId>>(
  states: S[]
) => states.filter((s) => !_.isNil(s.url));

// Check if all states are reachable from starting states
const traversabilityCheck = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>
) => {
  const states = graph.getStates();
  const edges = graph.getEdges();

  const startingStates = getStartingStates(states);
  if (startingStates.length === 0) return false;

  const stateDict = {
    ..._.mapValues(_.keyBy(states, "id"), () => false),
    ..._.mapValues(_.keyBy(startingStates, "id"), () => true),
    // TODO typing
  } as Record<StateId, boolean>;
  // TODO typing
  const edgeDict = _.mapValues(_.keyBy(edges, "name"), () => false) as Record<
    EdgeName,
    boolean
  >;
  let edgeHorizon = _.uniqBy(
    _.flatMap(startingStates, (s) => edges.filter((e) => e.from === s.id)),
    "name"
  );

  while (edgeHorizon.length > 0) {
    const newEdgeHorizon: typeof edges = _.flatMap(edgeHorizon, (s) => {
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

type ConditionalPropagationBfsHorizonEdge<
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  R extends string
> = {
  edge: Pick<
    Edges<EdgeName, S[], R>[number],
    "name" | "resourceEffects" | "to" | "from"
  >;
  condition: HorizonEdgeCondition<R>;
};
const conditionalPropagationBfs = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  R extends string
>(
  edges: Edges<EdgeName, S[], R>,
  iterLimit: number,
  initialHorizon: ConditionalPropagationBfsHorizonEdge<
    StateId,
    S,
    EdgeName,
    R
  >[],
  getEdgeNeighbours: (
    edge: (typeof edges)[number]
  ) => Pick<
    (typeof edges)[number],
    "name" | "resourceEffects" | "to" | "from"
  >[],
  resourceEffectEvaluator: (packValue: number, effectValue: number) => number,
  propagatedNextHorizonValidityPredicate: (
    horizonElement: ConditionalPropagationBfsHorizonEdge<
      StateId,
      S,
      EdgeName,
      R
    >
  ) => boolean,
  // if any horizon element passes, succeed. passing results become the final
  // horizon
  successPredicate: (
    edge: ConditionalPropagationBfsHorizonEdge<StateId, S, EdgeName, R>
  ) => boolean,
  // if defined, filters by valid conditions before they are propagated
  unpropagatedConditionPredicate?: (
    condition: HorizonEdgeCondition<R>
  ) => boolean
) => {
  const nameKeyedEdges = _.keyBy(edges, "name") as Record<
    EdgeName,
    (typeof edges)[number]
  >; // TODO typing
  const initialEdgeConditionMap: Partial<
    Record<EdgeName, Cond<EdgeCondition<R> | boolean>>
  > = _.mapValues(nameKeyedEdges, (edge) => _.cloneDeep(edge.condition));

  // TODO make prettyPrint condition order deterministic
  const serializeHorizonEdge = (
    edge: ConditionalPropagationBfsHorizonEdge<StateId, S, EdgeName, R>
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

  return bfs<ConditionalPropagationBfsHorizonEdge<StateId, S, EdgeName, R>>(
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

// Check if all conditional edges have some route from a starting state that
// satisfies their conditions
type Horizon<EdgeName extends string, R extends string> = {
  name: EdgeName;
  condition: HorizonEdgeCondition<R>;
}[];
const naiveSatisfiabilityCheck = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>
):
  | {
      conditionalEdge: EdgeName;
      horizons: Horizon<EdgeName, Resource>[];
    }[]
  | false => {
  const states: S[] = graph.getStates();
  const edges: Edges<EdgeName, S[], Resource> = graph.getEdges();
  const allResources = graph.getResources();
  // `keyBy` doesn't preserve string literals since the input may not contain
  // all possible keys, but all edges are provided here.
  // TODO associate this with the createEdges function
  const nameKeyedEdges = _.keyBy(edges, "name") as Record<
    EdgeName,
    (typeof edges)[number]
  >;
  const initialEdgeConditionMap: Partial<
    Record<EdgeName, Cond<EdgeCondition<Resource> | boolean>>
  > = _.mapValues(nameKeyedEdges, (edge) => _.cloneDeep(edge.condition));

  const startingStates = getStartingStates(states);
  const conditionalEdges = edges.filter((e) => !_.isNil(e.condition));

  try {
    const everyConditionalEdgesHorizons = _.map<
      (typeof conditionalEdges)[number],
      {
        conditionalEdge: EdgeName;
        horizons: Horizon<EdgeName, Resource>[];
      }
    >(conditionalEdges, (conditionalEdge) => {
      // initialize horizon with conditional edge
      const initialBackpropHorizon: ConditionalPropagationBfsHorizonEdge<
        StateId,
        S,
        EdgeName,
        Resource
      >[] = [
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
const getPathFromHorizonEdgeNames = <EdgeName extends string>(
  horizons: EdgeName[][],
  horizonEdgeFilter: (horizon: EdgeName) => boolean = () => true
): EdgeName[] => {
  const reversedHorizons = _.reverse(_.cloneDeep(horizons));

  return _.map(reversedHorizons, (horizon) => {
    const filteredHorizon = horizon.filter(horizonEdgeFilter);
    // TODO track multiple valid routes?
    const validEdge = _.first(filteredHorizon);
    if (_.isNil(validEdge)) throw new Error("Horizons not traversable");

    return validEdge;
  });
};

const traceValidPathThroughHorizons = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  R extends string
>(
  graph: Graph<StateId, S, EdgeName, R>,
  horizons: Horizon<EdgeName, R>[],
  updatePackTo: (packValue: number, effectValue: number) => number
): EdgeName[] => {
  const edges = graph.getEdges();
  const allResources = graph.getResources();
  const effectPack: Partial<Record<R, number>> = {};
  const addToPack = (resource: R, value: number | undefined) => {
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
      (val, res) => addToPack(res as R, val)
    );

    return validEdge.name;
  });
};

const getNonConditionalPaths = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>,
  conditionalEdgePaths: { edgeName: EdgeName; path: EdgeName[] }[]
): { edgeName: EdgeName; path: EdgeName[] }[] => {
  const states = graph.getStates();
  const edges = graph.getEdges();

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
        Record<EdgeName, { pathToNonConditional: EdgeName[] }>
      > = {};

      const checkHorizonForConditionalEdge = (horizon: EdgeName[]) => {
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

      let allHorizons: EdgeName[][] = [];

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
                    edgeName: edgeName as EdgeName, // TODO typing
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

const getPackFromPath = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  R extends string
>(
  path: EdgeName[],
  graph: Graph<StateId, S, EdgeName, R>,
  initialPack?: Partial<Record<R, number>>
): Record<R, number> => {
  const edges = graph.getEdges();
  const allResources = graph.getResources();

  const pack: Partial<Record<R, number>> = initialPack ?? {};

  const addToPack = (
    resourceEffect: (typeof edges)[number]["resourceEffects"]
  ) => {
    if (_.isNil(resourceEffect)) return;
    _.forEach(resourceEffect, (val, res) => {
      pack[res as R] = (pack[res as R] ?? 0) + (val ?? 0);
    });
  };

  const nameKeyedEdges = _.keyBy(edges, "name");

  _.forEach(path, (edgeName) => {
    const edge = nameKeyedEdges[edgeName];
    if (_.isNil(edge)) throw new Error("Edge not found");
    addToPack(edge.resourceEffects);
  });

  // TODO real types
  const zeroedResources: Record<R, number> = _.mapValues(
    _.keyBy(allResources),
    () => 0
  ) as Record<R, number>;

  return { ...zeroedResources, ...pack };
};

const packToCondition = <R extends string>(
  pack: Record<R, number>
): Cond<EdgeCondition<R>> => ({
  _and: _.flatMap<typeof pack, Cond<EdgeCondition<R>>>(
    pack,
    (val, resource) => {
      if (_.isNil(val)) return [];
      return [
        {
          // TODO typing
          resource: resource as R,
          value: val - 1,
          operator: "gt",
        },
        {
          // TODO typing
          resource: resource as R,
          value: val + 1,
          operator: "lt",
        },
      ];
    }
  ),
});

const getCleanupPath = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  R extends string
>(
  graph: Graph<StateId, S, EdgeName, R>,
  edgeToClean: EdgeName,
  pack: Record<R, number>
  // false or cleanup path
): false | EdgeName[] => {
  const edges = graph.getEdges();
  const allResources = graph.getResources();

  const initialEdge:
    | ConditionalPropagationBfsHorizonEdge<StateId, S, EdgeName, R>["edge"]
    | undefined = _.find(edges, (e) => e.name === edgeToClean);

  if (_.isNil(initialEdge)) throw new Error("Edge not found");

  const initialCond = packToCondition(pack);

  const condIsSuccessful = (cond: HorizonEdgeCondition<R>) =>
    !_.isNil(cond) && _.every(allResources, (r) => verifyCond(0, r, cond));

  if (condIsSuccessful(initialCond)) return []; // done early!

  const initialBackpropHorizon: ConditionalPropagationBfsHorizonEdge<
    StateId,
    S,
    EdgeName,
    R
  >[] = [{ edge: initialEdge, condition: initialCond }];

  const unpropagatedConditionPredicate = <R extends string>(
    condition: HorizonEdgeCondition<R>
  ) =>
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
        graph,
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

interface Route<EdgeName extends string> {
  edgeName: EdgeName;
  // drop last path element since it's the edge to clean
  preparationPath: EdgeName[];
  cleanupPath: EdgeName[];
}

const getNonRedundantRoutes = <EdgeName extends string>(
  routes: Route<EdgeName>[]
): Route<EdgeName>[] => {
  const keyedRoutes = _.keyBy(routes, "edgeName");
  const orderedStringifiedRoutes = _.orderBy(
    routes,
    (r) => r.preparationPath.length,
    "asc"
  ).map((r) => ({
    edgeName: r.edgeName,
    // TODO does this risk nonescaped shenanigans?
    preparationPath: [...r.preparationPath, r.edgeName].join(","),
  }));

  const nonredundantRoutes: Route<EdgeName>[] = [];
  _.forEach(orderedStringifiedRoutes, (route, i) => {
    if (
      _.every(_.range(i + 1, orderedStringifiedRoutes.length), (j) => {
        const otherRoute = orderedStringifiedRoutes[j];
        if (_.isNil(otherRoute)) return true; // ignore
        return !otherRoute.preparationPath.includes(route.preparationPath);
      })
    ) {
      const nonredundantRoute = keyedRoutes[route.edgeName];
      if (_.isNil(nonredundantRoute)) return true; // continue
      nonredundantRoutes.push(nonredundantRoute);
    }
  });

  return nonredundantRoutes;
};

interface Step {
  edgeName: string;
  type: "prep" | "action" | "cleanup";
}

// produce a list of edge action and cleanup steps that trace a path through the graph
export const runScheduler = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>
): Step[] => {
  console.log("Validating graph traversability");
  if (traversabilityCheck(graph) === false) {
    throw new Error("Some states are unreachable");
  }
  // automatically calculate prep and cleanup paths to resolve effects
  console.log("Validating graph satisfiability");
  const satisfiabilityCheckResult = naiveSatisfiabilityCheck(graph);
  if (satisfiabilityCheckResult === false) {
    // TODO actually say what's unsatisfiable
    throw new Error("Some conditions are unsatisfiable");
  }
  console.log("Calculating conditional paths");
  const conditionalPaths = _.map(satisfiabilityCheckResult, (result) => ({
    edgeName: result.conditionalEdge,
    path: traceValidPathThroughHorizons(
      graph,
      result.horizons,
      (packValue, effectValue) => packValue + effectValue
    ),
  }));

  console.log("Calculating non-conditional paths");
  const nonConditionalPaths = getNonConditionalPaths(graph, conditionalPaths);

  // TODO effectful implicit nav edges: add all implicit state -> starting state
  // edges to calculate complete paths

  const cleanupRoutes: Route<EdgeName>[] = _.map(
    [...conditionalPaths, ...nonConditionalPaths],
    (path) => {
      const cleanupPath = getCleanupPath(
        graph,
        path.edgeName,
        getPackFromPath(path.path, graph)
      );
      if (cleanupPath === false) {
        throw new Error(`No cleanup path found for: ${path}`);
      }
      return {
        edgeName: path.edgeName,
        // drop last path element since it's the edge to clean
        preparationPath: _.initial(path.path),
        cleanupPath,
      };
    }
  );

  const nonRedundantRoutes = getNonRedundantRoutes(cleanupRoutes);

  const edges = graph.getEdges();

  // label each step as prep, action, or cleanup.
  // - if an edge would be prep, but has never been traversed, call it an
  //   action. the actual route has been labeled redundant
  const edgeTraversed = _.mapValues(
    _.keyBy(edges, "name"),
    () => false
  ) as Record<EdgeName, boolean>;

  return _.flatMap(nonRedundantRoutes, (route) => [
    ..._.map(route.preparationPath, (e) => {
      const edgeUntraversed = !edgeTraversed[e];
      if (edgeUntraversed) edgeTraversed[e] = true;
      return {
        edgeName: e,
        type: edgeUntraversed ? ("action" as const) : ("prep" as const),
      };
    }),
    {
      edgeName: route.edgeName,
      type: "action" as const,
    },
    ..._.map(route.cleanupPath, (e) => ({
      edgeName: e,
      type: "cleanup" as const,
    })),
  ]);
};
