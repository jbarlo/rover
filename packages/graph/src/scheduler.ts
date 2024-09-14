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
import {
  GetAllEdgesResult,
  EdgeCondition,
  Graph,
  State,
  ValueOf,
  preparePack,
  AllEdgeName,
  Edge,
} from "./graph.js";
import { adjacentPairs, interlace, isSubArray } from "./utils.js";

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
  const edges = graph.getAllEdges();
  const navigableStates = graph.getNavigableStates();

  if (navigableStates.length === 0) return false;

  const stateDict = {
    ..._.mapValues(_.keyBy(states, "id"), () => false),
    ..._.mapValues(_.keyBy(navigableStates, "id"), () => true),
    // TODO typing
  } as Record<StateId, boolean>;
  const edgeDict: Record<keyof typeof edges, boolean> = _.mapValues(
    edges,
    () => false
  );
  let edgeHorizon = _.uniqBy(
    _.flatMap(navigableStates, (s) => _.filter(edges, (e) => e.from === s.id)),
    "name"
  );

  while (edgeHorizon.length > 0) {
    const newEdgeHorizon: ValueOf<typeof edges>[] = _.flatMap(
      edgeHorizon,
      (s) => {
        edgeDict[s.name] = true;
        if (!stateDict[s.to]) {
          stateDict[s.to] = true;
          // add outbound edges to edge horizon if not in edge dict
          const outboundEdges = _.filter(
            edges,
            (e) => e.from === s.to && !edgeDict[e.name]
          );
          return outboundEdges;
        }
        return [];
      }
    );

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
  performChecks?: (
    newHorizon: T[],
    horizons: T[][],
    iter: number
  ) => boolean | { pass: boolean; horizon: T[] }
): T[][] => {
  const horizons: T[][] = [_.cloneDeep(initialHorizon)];
  _.forEach(_.range(iterLimit), (iter) => {
    const currHorizon = horizons[iter];
    if (_.isNil(currHorizon)) throw new Error("Current horizon wasn't found");
    const newHorizonResult = getNextHorizon(currHorizon);

    if (newHorizonResult.endWithoutChecking) {
      horizons.push(newHorizonResult.horizon);
      return false; // break
    }

    if (_.isEmpty(newHorizonResult)) {
      throw new Error("No more edges to traverse");
    }

    const newHorizon = _.cloneDeep(newHorizonResult.horizon);

    const checkResult = _.isNil(performChecks)
      ? true
      : performChecks(newHorizon, [...horizons, newHorizon], iter);

    horizons.push(_.isBoolean(checkResult) ? newHorizon : checkResult.horizon);

    if (_.isBoolean(checkResult) && !checkResult) return false;
    if (!_.isBoolean(checkResult) && !checkResult.pass) return false;
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
    ValueOf<GetAllEdgesResult<StateId, S, EdgeName, R>>,
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
  graph: Graph<StateId, S, EdgeName, R>,
  iterLimit: number,
  initialHorizon: ConditionalPropagationBfsHorizonEdge<
    StateId,
    S,
    EdgeName,
    R
  >[],
  getEdgeNeighbours: (
    edge: ValueOf<GetAllEdgesResult<StateId, S, EdgeName, R>>
  ) => Pick<
    ValueOf<GetAllEdgesResult<StateId, S, EdgeName, R>>,
    "name" | "resourceEffects" | "to" | "from"
  >[],
  resourceEffectEvaluator: (packValue: number, effectValue: number) => number,
  predicates: {
    // if any horizon element passes, succeed. passing results become the final
    // horizon
    success: (
      edge: ConditionalPropagationBfsHorizonEdge<StateId, S, EdgeName, R>
    ) => boolean;
    // if defined, filters by valid conditions before they are propagated
    unpropagatedConditionValidity: (
      horizonEdgeCondition: Cond<boolean | EdgeCondition<R>>,
      neighbourCondition: Cond<boolean | EdgeCondition<R>>
    ) => boolean;
    propagatedNextHorizonValidity: (
      horizonEdgeCondition: Cond<boolean | EdgeCondition<R>>,
      neighbourCondition: Cond<boolean | EdgeCondition<R>>
    ) => boolean;
  },
  constructHorizonEdgeCondition: (
    propagatedCondition: Cond<boolean | EdgeCondition<R>>,
    neighbourCondition: Cond<boolean | EdgeCondition<R>>
  ) => Cond<boolean | EdgeCondition<R>>
) => {
  const edges = graph.getAllEdges();
  const initialEdgeConditionMap: Partial<
    Record<keyof typeof edges, Cond<EdgeCondition<R> | boolean>>
  > = _.mapValues(edges, (edge) => _.cloneDeep(edge.condition));

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
          const prevHorizonEdge = edges[prevHorizonEdgeName];

          // get all edges that are directional neighbours to prevHorizonEdge
          const neighbours = getEdgeNeighbours(prevHorizonEdge);

          // propagate the condition from prevHorizonEdge to neighbours
          return _.compact(
            _.map(neighbours, (neighbourEdge) => {
              const initialNeighbourEdgeCondition =
                _.cloneDeep(initialEdgeConditionMap[neighbourEdge.name]) ??
                true;

              if (
                !predicates.unpropagatedConditionValidity(
                  prevHorizonEdgeCondition ?? true,
                  initialNeighbourEdgeCondition
                )
              ) {
                return null;
              }

              const propagatedCondition = propagateCondition(
                prevHorizonEdgeCondition ?? true,
                neighbourEdge.resourceEffects,
                resourceEffectEvaluator
              );

              if (
                !predicates.propagatedNextHorizonValidity(
                  propagatedCondition,
                  initialNeighbourEdgeCondition
                )
              ) {
                return null;
              }

              // for every neighbour,
              // if no condition exists, use only the propped condition
              //    (true && propped condition)
              // if a condition exists, preserve it and AND it with the backpropped condition
              //    (existing condition && propped condition)

              // TODO if all propped conditions subsumed by edge's initial
              // condition, consider a DP approach

              // TODO implement simplification for fewer test values
              const totalCondition = constructHorizonEdgeCondition(
                propagatedCondition,
                initialNeighbourEdgeCondition
              );

              return {
                edge: neighbourEdge,
                condition: simplifyHorizonEdgeCond(totalCondition),
              };
            })
          );
        }
      );

      const uniqueNextHorizon = _.uniqBy(
        nextHorizon,
        // TODO does the edge name even matter? maybe yes, to calculate
        // alternative paths
        (h) => serializeHorizonEdge(h)
      );

      // if successPredicate passes, succeed 🤯
      if (
        // FIXME inefficient
        _.some(uniqueNextHorizon, (horizonEdge) =>
          predicates.success(horizonEdge)
        )
      ) {
        return {
          endWithoutChecking: true,
          // record edges that are off of starting states and have valid
          // conditions
          horizon: _.filter(uniqueNextHorizon, (horizonEdge) =>
            predicates.success(horizonEdge)
          ),
        };
      }

      return { horizon: uniqueNextHorizon };
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

// Forward-propagate conditions through the graph until the successPredicate is
// true or the iterLimit is reached.
//
// Forward traversal of the graph is gated by valid conditions.
//
// ie perform a resource check, then apply resource-effect.
//
// Therefore, forward propagation is performed in steps:
// - check if the current condition is compatible with the candidate neighbour's
//   condition
// - if so, propagate the existing condition to the neighbour
const propagatePackAsCondition = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const R extends string
>(
  graph: Graph<StateId, S, EdgeName, R>,
  iterLimit: number,
  initialHorizon: ConditionalPropagationBfsHorizonEdge<
    StateId,
    S,
    EdgeName,
    R
  >[],
  successPredicate: (
    edge: ConditionalPropagationBfsHorizonEdge<StateId, S, EdgeName, R>
  ) => boolean
) => {
  const edges = graph.getAllEdges();
  return conditionalPropagationBfs(
    graph,
    iterLimit,
    initialHorizon,
    (neighbour) => _.filter(edges, (e) => e.from === neighbour.to),
    (packValue, effectValue) => packValue + effectValue,
    {
      success: successPredicate,
      unpropagatedConditionValidity: (
        unpropagatedCondition,
        neighbourCondition
      ) => {
        const condition = simplifyHorizonEdgeCond(
          combineCond({
            _and: [neighbourCondition, unpropagatedCondition ?? true],
          })
        );
        return (
          _.isNil(condition) ||
          (_.isBoolean(condition) && condition) ||
          (!_.isBoolean(condition) && edgeConditionIsSatisfiable(condition))
        );
      },
      propagatedNextHorizonValidity: (propagatedCondition) =>
        _.isNil(propagatedCondition) ||
        edgeConditionIsSatisfiable(propagatedCondition),
    },
    (propagatedCondition) => propagatedCondition
  );
};

// back-propagate conditions through the graph until the successPredicate is
// true or the iterLimit is reached.
//
// Forward traversal of the graph is gated by valid conditions.
//
// ie perform a resource check, then apply resource-effect.
//
// Inversing this, back-propagation applies the inverse resource-effect before
// checking.
//
// Therefore, back-propagation is performed in steps:
// - check if a propagated-and-combined-with-neighbour condition would be
//   compatible
// - if so, use that compatible condition for the next horizon
const backpropagatePackAsCondition = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const R extends string
>(
  graph: Graph<StateId, S, EdgeName, R>,
  iterLimit: number,
  initialHorizon: ConditionalPropagationBfsHorizonEdge<
    StateId,
    S,
    EdgeName,
    R
  >[],
  successPredicate: (
    edge: ConditionalPropagationBfsHorizonEdge<StateId, S, EdgeName, R>
  ) => boolean
) => {
  const edges = graph.getAllEdges();
  return conditionalPropagationBfs(
    graph,
    iterLimit,
    initialHorizon,
    (neighbour) => _.filter(edges, (e) => e.to === neighbour.from),
    (packValue, effectValue) => packValue - effectValue,
    {
      success: successPredicate,
      unpropagatedConditionValidity: (
        unpropagatedCondition,
        neighbourCondition
      ) => {
        const condition = combineCond({
          _and: [unpropagatedCondition ?? true, neighbourCondition],
        });
        return (
          _.isNil(condition) ||
          (_.isBoolean(condition) && condition) ||
          (!_.isBoolean(condition) && edgeConditionIsSatisfiable(condition))
        );
      },
      propagatedNextHorizonValidity: (
        propagatedCondition,
        neighbourCondition
      ) => {
        const condition = combineCond({
          _and: [propagatedCondition, neighbourCondition],
        });
        return _.isNil(condition) || edgeConditionIsSatisfiable(condition);
      },
    },
    (propagatedCondition, neighbourCondition) =>
      combineCond({
        _and: [propagatedCondition, neighbourCondition],
      })
  );
};

type IsNeighbourWithPrev<
  EdgeName extends string,
  StateId extends string,
  S extends State<StateId>,
  R extends string
> = (
  prevEdge: Edge<AllEdgeName<EdgeName, StateId>, StateId, S, R>,
  currEdge: Edge<AllEdgeName<EdgeName, StateId>, StateId, S, R>
) => boolean;
const traceValidPathThroughHorizons = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  R extends string,
  H extends { name: AllEdgeName<EdgeName, StateId> }
>(
  graph: Graph<StateId, S, EdgeName, R>,
  horizons: H[][],
  isNeighbourWithPrev: IsNeighbourWithPrev<EdgeName, StateId, S, R>,
  // TODO consider just filtering before passing
  firstHorizonFilter: (horizon: H) => boolean = () => true,
  validationFilter: (horizon: H) => boolean = () => true,
  onValidEdgeFound?: (validEdge: H) => void
): AllEdgeName<EdgeName, StateId>[] => {
  const edges = graph.getAllEdges();

  const reversedHorizons = _.reverse(_.cloneDeep(horizons));

  let previousEdgeName: AllEdgeName<EdgeName, StateId> | null = null;
  return _.map(reversedHorizons, (horizon) => {
    const validEdges = horizon.filter(
      (horizon) =>
        (!_.isNil(previousEdgeName) || firstHorizonFilter(horizon)) &&
        (_.isNil(previousEdgeName) ||
          isNeighbourWithPrev(edges[previousEdgeName], edges[horizon.name])) &&
        validationFilter(horizon)
    );
    // TODO track multiple valid routes?
    const validEdge = _.first(validEdges);
    if (_.isNil(validEdge)) throw new Error("Horizons not traversable");

    onValidEdgeFound?.(validEdge);

    previousEdgeName = validEdge.name;

    return validEdge.name;
  });
};

// TODO consider and confirm merging this with traceValidPathThroughHorizons
const traceValidPathThroughHorizonsWithPack = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const R extends string
>(
  graph: Graph<StateId, S, EdgeName, R>,
  horizons: Horizon<AllEdgeName<EdgeName, StateId>, R>[],
  isNeighbourWithPrev: IsNeighbourWithPrev<EdgeName, StateId, S, R>,
  firstHorizonFilter: (
    horizonEdge: Horizon<AllEdgeName<EdgeName, StateId>, R>[number]
  ) => boolean,
  updatePackTo: (packValue: number, effectValue: number) => number
): AllEdgeName<EdgeName, StateId>[] => {
  const edges = graph.getAllEdges();
  const allResources = graph.getResources();

  const { getPack, applyResourceEffects } = preparePack(graph);

  return traceValidPathThroughHorizons(
    graph,
    horizons,
    isNeighbourWithPrev,
    firstHorizonFilter,
    (edge) => {
      const cond = edge.condition;
      return (
        _.isNil(cond) ||
        _.every(allResources, (r) => verifyCond(getPack()[r], r, cond))
      );
    },
    (validEdge) => {
      const resourceEffects = _.find(
        edges,
        (e) => e.name === validEdge.name
      )?.resourceEffects;
      if (_.isNil(resourceEffects)) return;
      applyResourceEffects(resourceEffects, (prev, value) =>
        updatePackTo(prev, value)
      );
    }
  );
};

// Check if all conditional edges have some route from a starting state that
// satisfies their conditions. If not, return false
type Horizon<EdgeName extends string, R extends string> = {
  name: EdgeName;
  condition: HorizonEdgeCondition<R>;
}[];
export const getConditionalPaths = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>
):
  | {
      edgeName: EdgeName;
      path: AllEdgeName<EdgeName, StateId>[];
    }[]
  | false => {
  const allEdges = graph.getAllEdges();
  const explicitEdges = graph.getExplicitEdges();
  const allResources = graph.getResources();
  const initialEdgeConditionMap: Partial<
    Record<EdgeName, Cond<EdgeCondition<Resource> | boolean>>
  > = _.mapValues(explicitEdges, (edge) => _.cloneDeep(edge.condition));

  const navigableStates = graph.getNavigableStates();
  const conditionalEdges = _.filter(
    explicitEdges,
    (e) => !_.isNil(e.condition)
  );

  try {
    const everyConditionalEdgesHorizons = _.map<
      (typeof conditionalEdges)[number],
      {
        edgeName: EdgeName;
        path: AllEdgeName<EdgeName, StateId>[];
      }
    >(conditionalEdges, (conditionalEdge, i) => {
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

      const allHorizons = backpropagatePackAsCondition(
        graph,
        CONDITIONAL_ITER_LIMIT,
        initialBackpropHorizon,
        ({ edge: e, condition: cond }) =>
          // if validNewBackpropHorizon contains an edge off of the starting
          // state, (and implicitly the condition is valid), succeed
          _.some(
            navigableStates,
            (s): boolean =>
              e.from === s.id &&
              !_.isNil(cond) &&
              _.every(allResources, (r) => verifyCond(0, r, cond))
          )
      );

      const horizons = _.map(allHorizons, (horizon) =>
        _.map(horizon, (h) => ({
          name: h.edge.name,
          condition: h.condition,
        }))
      );

      return {
        edgeName: conditionalEdge.name,
        path: traceValidPathThroughHorizonsWithPack(
          graph,
          horizons,
          (prevEdge, currEdge) => prevEdge.to === currEdge.from,
          (horizonEdge) => {
            const edge = allEdges[horizonEdge.name];
            return _.some(
              graph.getNavigableStates(),
              (navState) => navState.id === edge.from
            );
          },
          (packValue, effectValue) => packValue + effectValue
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

type NonConditionalPaths<EdgeName, PathElement> = {
  edgeName: EdgeName;
  path: PathElement[];
}[];
export const getNonConditionalPaths = <
  const StateId extends string,
  S extends State<StateId>,
  const ExplicitEdgeName extends string,
  const Resource extends string
>(
  graph: Graph<StateId, S, ExplicitEdgeName, Resource>,
  conditionalEdgePaths: {
    edgeName: ExplicitEdgeName;
    path: AllEdgeName<ExplicitEdgeName, StateId>[];
  }[]
): NonConditionalPaths<
  ExplicitEdgeName,
  AllEdgeName<ExplicitEdgeName, StateId>
> => {
  type AllEdgeNames = AllEdgeName<ExplicitEdgeName, StateId>;

  const edges = graph.getAllEdges();

  // for every nonconditional edge, determine path to a starting state using
  // conditional edges
  const navigableStates = graph.getNavigableStates();
  const nonConditionalEdges = _.filter(graph.getExplicitEdges(), (e) =>
    _.isNil(e.condition)
  );

  const conditionalEdgePathsWithEdgeData = _.compact(
    conditionalEdgePaths.map((e) => {
      const edge = edges[e.edgeName];
      return { edge, path: e.path };
    })
  );

  const nonConditionalStartingStateDepartureEdges = _.filter(
    graph.getAllEdges(),
    (edge) =>
      _.some(
        navigableStates,
        (s) => s.id === edge.from && _.isNil(edge.condition)
      )
  );

  const nonConditionalStartingStateDepartureEdgesAsPaths = _.map(
    nonConditionalStartingStateDepartureEdges,
    (edge) => ({
      edge,
      path: [edge.name],
    })
  );

  const nameKeyedStarterOrConditionalEdgePaths = _.keyBy(
    [
      ...conditionalEdgePathsWithEdgeData,
      ...nonConditionalStartingStateDepartureEdgesAsPaths,
    ],
    (e) => e.edge.name
  );

  const nonConditionalEdgePaths = _.map(
    nonConditionalEdges,
    (nonConditionalEdge) => {
      // if nonconditional edge starts at a starting state, return it
      if (_.some(navigableStates, (s) => s.id === nonConditionalEdge.from)) {
        return {
          edgeName: nonConditionalEdge.name,
          path: [nonConditionalEdge.name],
        };
      }

      const completionEdgeFound: Partial<
        Record<AllEdgeNames, { pathToNonConditional: AllEdgeNames[] }>
      > = {};

      const getConditionalEdgesInHorizon = (horizon: AllEdgeNames[]) => {
        const horizonEdgeMatrix = _.flatMap(horizon, (edgeName) => {
          const horizonEdge = edges[edgeName];
          return _.map(conditionalEdgePathsWithEdgeData, (e) => ({
            horizonEdge,
            conditionalEdge: e,
          }));
        });
        const matchingConditionalEdges = _.filter(
          horizonEdgeMatrix,
          (horizonEdgePair) =>
            horizonEdgePair.horizonEdge.name ===
            horizonEdgePair.conditionalEdge.edge.name
        );

        return _.map(
          matchingConditionalEdges,
          (e) => e.conditionalEdge.edge.name
        );
      };

      // BFS for NONCONDITIONAL_PATH_LIMIT iterations or break if no more edges to
      // traverse or starting state reached.
      try {
        bfs<AllEdgeNames>(
          NONCONDITIONAL_PATH_LIMIT,
          [nonConditionalEdge.name],
          (prev) => ({
            horizon: _.uniq(
              _.flatMap(prev, (edgeName) => {
                const edge = edges[edgeName];
                const backEdges = _.filter(edges, (e) => e.to === edge.from);
                return backEdges.map((e) => e.name);
              })
            ),
          }),
          (newHorizon, horizons) => {
            let horizonToReturn = [...newHorizon];

            // if horizon contains a conditional edge, store its path
            const conditionalEdgeNames =
              getConditionalEdgesInHorizon(newHorizon);
            _.each(conditionalEdgeNames, (conditionalEdgeName) => {
              // skip if this conditional edge has already been found before so
              // the shortest path to it is preserved.
              if (_.isNil(completionEdgeFound[conditionalEdgeName])) {
                completionEdgeFound[conditionalEdgeName] = {
                  // lop off the head. the conditional path includes its own edge
                  pathToNonConditional: _.tail(
                    traceValidPathThroughHorizons(
                      graph,
                      _.map(horizons, (horizon) =>
                        _.map(horizon, (h) => ({ name: h }))
                      ),
                      (prevEdge, currEdge) => prevEdge.to === currEdge.from
                    )
                  ),
                };
              }
            });
            // omit the recorded conditionals from this horizon to avoid
            // exploring its path
            horizonToReturn = _.reject(horizonToReturn, (edgeName) =>
              _.some(
                conditionalEdgeNames,
                (condEdgeName) => edgeName === condEdgeName
              )
            );
            // NOTE: don't escape just after conditionals in case a starting
            // state is reached in fewer steps

            // break if a starting state is reached
            const startingStateNeighbourEdge = _.find(
              newHorizon,
              (edgeName) => {
                const edge = edges[edgeName];
                return _.some(navigableStates, (s) => s.id === edge.from);
              }
            );
            if (!_.isNil(startingStateNeighbourEdge)) {
              completionEdgeFound[startingStateNeighbourEdge] = {
                pathToNonConditional: _.tail(
                  traceValidPathThroughHorizons(
                    graph,
                    _.map(horizons, (horizon) =>
                      _.map(horizon, (h) => ({ name: h }))
                    ),
                    (prevEdge, currEdge) => prevEdge.to === currEdge.from,
                    (horizonEdge) => {
                      const edge = edges[horizonEdge.name];
                      return _.some(
                        graph.getNavigableStates(),
                        (navState) => navState.id === edge.from
                      );
                    }
                  )
                ),
              };
              return false; // break
            }

            return { pass: true, horizon: horizonToReturn }; // continue
          }
        );
      } catch {
        // no more edges to traverse. silence and check completionEdgeFound
      }

      // no conditional edge found and no starting state reached
      if (_.filter(completionEdgeFound, (v) => !_.isNil(v)).length <= 0) {
        throw new Error(
          "No conditional edge or edge off of starting state found"
        );
      }

      // calculate the shortest total path to a starting state
      const shortestCompletionPath = _.minBy(
        _.compact(
          _.map(completionEdgeFound, (val, edgeName) =>
            _.isNil(val)
              ? undefined
              : {
                  edgeName: edgeName as ExplicitEdgeName, // TODO typing
                  pathToNonConditional: val.pathToNonConditional,
                }
          )
        ),
        (v) => {
          return (
            (nameKeyedStarterOrConditionalEdgePaths[v.edgeName]?.path.length ??
              0) + v.pathToNonConditional.length
          );
        }
      );
      if (_.isNil(shortestCompletionPath)) return null;
      const conditionalEdgePath =
        nameKeyedStarterOrConditionalEdgePaths[shortestCompletionPath.edgeName]
          ?.path ?? [];
      return {
        edgeName: nonConditionalEdge.name,
        path: [
          ...conditionalEdgePath,
          ...shortestCompletionPath.pathToNonConditional,
        ],
      };
    }
  );

  return _.compact(nonConditionalEdgePaths);
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
          operator: "gt" as const,
        },
        {
          // TODO typing
          resource: resource as R,
          value: val + 1,
          operator: "lt" as const,
        },
      ];
    }
  ),
});

const getCleanupPath = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const R extends string
>(
  graph: Graph<StateId, S, EdgeName, R>,
  edgeToClean: EdgeName,
  pack: Record<R, number>
  // false or cleanup path
): false | AllEdgeName<EdgeName, StateId>[] => {
  const edges = graph.getAllEdges();
  const allResources = graph.getResources();

  const initialEdge:
    | ConditionalPropagationBfsHorizonEdge<StateId, S, EdgeName, R>["edge"] =
    edges[edgeToClean];

  const initialCond = packToCondition(pack);

  const condIsSuccessful = (cond: HorizonEdgeCondition<R>) =>
    !_.isNil(cond) && _.every(allResources, (r) => verifyCond(0, r, cond));

  if (condIsSuccessful(initialCond)) return []; // done early!

  const initialPropHorizon: ConditionalPropagationBfsHorizonEdge<
    StateId,
    S,
    EdgeName,
    R
  >[] = [{ edge: initialEdge, condition: initialCond }];

  try {
    const allHorizons = propagatePackAsCondition(
      graph,
      CONDITIONAL_CLEANUP_ITER_LIMIT,
      initialPropHorizon,
      // if validNewHorizon contains a 0-pack, succeed
      ({ condition: cond }) => condIsSuccessful(cond)
    );

    return _.reverse(
      traceValidPathThroughHorizonsWithPack(
        graph,
        // ignore first element since it's the edge to clean
        _.tail(allHorizons).map((horizon) =>
          horizon.map((edge) => ({
            name: edge.edge.name,
            condition: edge.condition,
          }))
        ),
        (prevEdge, currEdge) => prevEdge.from === currEdge.to,
        () => true,
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
    preparationPath: [...r.preparationPath, r.edgeName],
  }));

  const nonredundantRoutes: Route<EdgeName>[] = [];
  _.forEach(orderedStringifiedRoutes, (route, i) => {
    if (
      _.every(_.range(i + 1, orderedStringifiedRoutes.length), (j) => {
        const otherRoute = orderedStringifiedRoutes[j];
        if (_.isNil(otherRoute)) return true; // ignore
        return !isSubArray(otherRoute.preparationPath, route.preparationPath);
      })
    ) {
      const nonredundantRoute = keyedRoutes[route.edgeName];
      if (_.isNil(nonredundantRoute)) return true; // continue
      nonredundantRoutes.push(nonredundantRoute);
    }
  });

  return nonredundantRoutes;
};

const constructTotalPath = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>,
  routes: Route<AllEdgeName<EdgeName, StateId>>[]
) => {
  const nonRedundantRoutes = getNonRedundantRoutes(routes);

  // label each step as prep, action, or cleanup.
  // - if an edge would be prep, but has never been traversed, call it an
  //   action. the actual route has been labeled redundant
  const nonimplicitEdges = graph.getExplicitEdges();
  const edgeTraversed = _.mapValues(nonimplicitEdges, () => false) as Record<
    AllEdgeName<EdgeName, StateId>,
    boolean
  >; // TODO typing

  // stitch implicit edges between paths as necessary so arbitrary paths can
  // precede any other path, with any other starting state
  const unstitchedRoutes = _.map(nonRedundantRoutes, (route) => [
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
  const edges = graph.getAllEdges();
  const implicitEdges = graph.getImplicitEdges();
  return _.flatten(
    interlace(unstitchedRoutes, (before, after) => {
      const lastBeforeEdge = _.last(before);
      const firstAfterEdge = _.first(after);
      if (_.isNil(lastBeforeEdge) || _.isNil(firstAfterEdge))
        throw new Error("Empty route found");

      const beforeEdge = edges[lastBeforeEdge.edgeName];
      const afterEdge = edges[firstAfterEdge.edgeName];

      // already linked - don't do anything
      if (beforeEdge.to === afterEdge.from) return [];

      const implicitEdge = _.find(
        implicitEdges,
        (e) => e.from === beforeEdge.to && e.to === afterEdge.from
      );
      if (_.isNil(implicitEdge)) throw new Error("Implicit edge not found");
      return [{ type: "cleanup" as const, edgeName: implicitEdge.name }];
    })
  );
};

const getPackFromPath = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const R extends string
>(
  path: AllEdgeName<EdgeName, StateId>[],
  graph: Graph<StateId, S, EdgeName, R>,
  initialPack?: Partial<Record<R, number>>
): Record<R, number> => {
  const edges = graph.getAllEdges();

  const { getPack, applyResourceEffects } = preparePack(graph, initialPack);

  _.forEach(path, (edgeName) => {
    const edge = edges[edgeName];
    applyResourceEffects(edge.resourceEffects, (prev, value) => prev + value);
  });

  return getPack();
};

export interface Step<EdgeName extends string> {
  edgeName: EdgeName;
  type: "prep" | "action" | "cleanup";
}

const verifyPathIsContiguous = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>,
  path: Step<AllEdgeName<EdgeName, StateId>>[]
) => {
  const edges = graph.getAllEdges();

  const neighbourSteps = adjacentPairs(path);
  return (
    neighbourSteps.isSolo ||
    _.every(
      neighbourSteps.pairs,
      ([a, b]) => edges[a.edgeName].to === edges[b.edgeName].from
    )
  );
};
const verifyPathRespectsConditionals = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>,
  path: Step<AllEdgeName<EdgeName, StateId>>[]
) => {
  const edges = graph.getAllEdges();
  const allResources = graph.getResources();

  const { getPack, applyResourceEffects } = preparePack(graph);

  return _.every(path, ({ edgeName }) => {
    const edge = edges[edgeName];
    const resourceEffects = edge.resourceEffects;
    const edgeCondition = edge.condition;

    const packIsValidForEdge =
      _.isNil(edgeCondition) ||
      _.every(allResources, (r) => verifyCond(getPack()[r], r, edgeCondition));

    applyResourceEffects(resourceEffects, (prev, value) => prev + value);

    return packIsValidForEdge;
  });
};
const verifyPathEndsWithEmptyPack = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>,
  path: Step<AllEdgeName<EdgeName, StateId>>[]
) => {
  const edges = graph.getAllEdges();
  const allResources = graph.getResources();

  const { getPack, applyResourceEffects } = preparePack(graph);

  _.forEach(path, ({ edgeName }) => {
    const edge = edges[edgeName];
    applyResourceEffects(edge.resourceEffects, (prev, value) => prev + value);
  });

  return _.every(allResources, (r) => getPack()[r] === 0);
};
const verifyEveryExplicitEdgeHasOneActionStep = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>,
  path: Step<AllEdgeName<EdgeName, StateId>>[]
) => {
  const edges = graph.getExplicitEdges();
  const filteredPath = _.filter(path, ({ type }) => type === "action");
  return _.size(edges) === filteredPath.length;
};
export const pathIsValid = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>,
  path: Step<AllEdgeName<EdgeName, StateId>>[]
) => {
  if (!verifyPathIsContiguous(graph, path)) return false;
  if (!verifyPathRespectsConditionals(graph, path)) return false;
  if (!verifyPathEndsWithEmptyPack(graph, path)) return false;
  if (!verifyEveryExplicitEdgeHasOneActionStep(graph, path)) return false;

  return true;
};

// produce a list of edge action and cleanup steps that trace a path through the
// graph
//
// TODO improvements:
// - treat cleanup steps as potential for deredundancy
// - current implementation doesn't construct new paths on the fly, resulting in
//   it cleaning up a bunch of resources just to recreate them again
// - tracking more valid paths might help determine more optimal total paths
export const runScheduler = <
  const StateId extends string,
  S extends State<StateId>,
  const EdgeName extends string,
  const Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>
): Step<AllEdgeName<EdgeName, StateId>>[] => {
  console.log("Validating graph traversability");
  if (traversabilityCheck(graph) === false) {
    throw new Error("Some states are unreachable");
  }
  // automatically calculate prep and cleanup paths to resolve effects
  console.log("Validating graph satisfiability");
  const conditionalPaths = getConditionalPaths(graph);
  if (conditionalPaths === false) {
    // TODO actually say what's unsatisfiable
    throw new Error("Some conditions are unsatisfiable");
  }
  console.log("Calculating conditional paths");

  console.log("Calculating non-conditional paths");
  const nonConditionalPaths = getNonConditionalPaths(graph, conditionalPaths);

  console.log("Constructing routes");
  const routes: Route<AllEdgeName<EdgeName, StateId>>[] = _.map(
    [...conditionalPaths, ...nonConditionalPaths],
    (path) => {
      const cleanupPath = getCleanupPath(
        graph,
        path.edgeName,
        getPackFromPath(path.path, graph)
      );
      if (cleanupPath === false) {
        throw new Error(`No cleanup path found for: ${path.edgeName}`);
      }
      return {
        edgeName: path.edgeName,
        // drop last path element since it's the edge to clean
        preparationPath: _.initial(path.path),
        cleanupPath,
      };
    }
  );

  console.log("Synthesizing total path");
  const totalPath = constructTotalPath(graph, routes);
  console.log(totalPath);

  if (!pathIsValid(graph, totalPath))
    throw new Error("Constructed an invalid path");

  return totalPath;
};
