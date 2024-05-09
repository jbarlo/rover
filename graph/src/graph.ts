import _ from "lodash";
import { Cond } from "./cond.js";

export interface State<ID extends string> {
  id: ID;
  // the state's canonical url, if it exists
  // TODO find a way to handle *static-er* slugs
  url?: string;
  navigable?: boolean;
}

export const createStates = <ID extends string>(states: State<ID>[]) => {
  return states;
};

export type EdgeCondition<Resource extends string> = {
  resource: Resource;
  value: number;
  operator: "lt" | "gt";
};

export type ResourceEffects<R extends string> = Partial<Record<R, number>>;

interface BaseEdge<
  EdgeName extends string,
  ID extends string,
  Resource extends string | null = null
> {
  from: ID;
  to: ID;
  name: EdgeName;
  // the changes made to resources through the action
  resourceEffects?: Resource extends string
    ? ResourceEffects<Resource>
    : undefined;
  condition?: Resource extends string
    ? Cond<EdgeCondition<Resource>>
    : undefined;
  action: () => void;
  virtual?: boolean;
}

export type Edges<
  EdgeName extends string,
  States extends State<string>[],
  Resource extends string | null = null
> = BaseEdge<EdgeName, States[number]["id"], Resource>[];

export const createEdges = <
  EdgeName extends string,
  StateId extends string,
  States extends State<StateId>,
  Resource extends string | undefined = undefined
>(
  edges: Edges<
    EdgeName,
    States[],
    Resource extends undefined ? null : Resource
  >,
  states: States[],
  resources?: Resource[]
) => {
  return edges;
};

// TODO nice things for a not a monad -- all clones of the actual underlying
// - keyed edges -- with 1-to-1 guarantees
// - keyed states -- with 1-to-1 guarantees
// - starting states (keyed maybe)
// - all resources
type ImplicitEdge<StateId extends string> = `implicit-${StateId}-to-${StateId}`;

type GetEdgesResult<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> = Record<EdgeName, BaseEdge<EdgeName, StateId, Resource>>;
export type AllEdgesResult<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> = GetEdgesResult<StateId, EdgeName | ImplicitEdge<StateId>, Resource>;
export type OnlyExplicitEdgesResult<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> = GetEdgesResult<StateId, EdgeName, Resource>;
type GetEdges<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> = {
  (excludeImplicit?: false): AllEdgesResult<StateId, EdgeName, Resource>;
  (excludeImplicit: true): OnlyExplicitEdgesResult<StateId, EdgeName, Resource>;
};

export interface Graph<
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
> {
  getEdges: GetEdges<StateId, EdgeName, Resource>;
  getImplicitEdges: () => BaseEdge<ImplicitEdge<StateId>, StateId, Resource>[];
  getStates: () => S[];
  getNavigableStates: () => S[];
  getResources: () => Resource[];
}
export const initGraph: <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  states: S[],
  edges: Edges<EdgeName, S[], Resource>,
  resources: Resource[]
) => Graph<StateId, S, EdgeName, Resource> = (states, edges, resources) => {
  type Resource = (typeof resources)[number];
  type StateId = (typeof states)[number]["id"];
  type EdgeName = (typeof edges)[number]["name"];

  const getStates = () => _.cloneDeep(states);
  const getNavigableStates = () => getStates().filter((s) => !_.isNil(s.url));

  // TODO implicit edges with effects -- will affect path stitching
  const implicitEdges = _.flatMap(getNavigableStates(), (navState) =>
    _.compact(
      _.map(getStates(), (otherState) => {
        if (navState.id === otherState.id) return null;
        const implicitEdge = {
          from: otherState.id,
          to: navState.id,
          // TODO guarantee uniqueness
          name: `implicit-${otherState.id}-to-${navState.id}` as const,
          // TODO internal type to avoid action?
          action: () => {},
        };
        return implicitEdge;
      })
    )
  );

  const getImplicitEdges = () => _.cloneDeep(implicitEdges);

  const getEdges: GetEdges<StateId, EdgeName, Resource> = (
    excludeImplicit = false
  ) => {
    if (excludeImplicit) {
      const toReturn = _.keyBy(
        _.cloneDeep(edges),
        "name"
      ) as OnlyExplicitEdgesResult<StateId, EdgeName, Resource>; // TODO typing
      return toReturn as any; // concession for function overload
    }
    const toReturn = _.keyBy(
      [..._.cloneDeep(edges), ...getImplicitEdges()],
      "name"
    ) as AllEdgesResult<StateId, EdgeName, Resource>; // TODO typing
    return toReturn as any; // concession for function overload
  };

  // Validation
  // TODO zod
  const s = getStates();
  if (s.length !== _.uniqBy(s, "id").length) {
    throw new Error("Duplicate state IDs");
  }

  const e = _.map(getEdges(), (e) => e);
  if (e.length !== _.uniqBy(e, "name").length) {
    throw new Error("Duplicate edge names");
  }

  return {
    getEdges,
    getImplicitEdges,
    getStates,
    getNavigableStates,
    getResources: () => _.cloneDeep(resources),
  };
};

export type ValueOf<T> = T[keyof T];

export type AllEdgeNames<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> = ValueOf<AllEdgesResult<StateId, EdgeName, Resource>>["name"];

export const preparePack = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>,
  initialPack?: Partial<Record<Resource, number>>
) => {
  const emptyPack = _.mapValues(
    _.keyBy(graph.getResources(), (r) => r),
    () => 0
  ) as Record<Resource, number>; // TODO typing
  const pack: Record<Resource, number> = {
    ...emptyPack,
    ..._.omitBy(initialPack, (v) => _.isNil(v)),
  };

  const updatePack = (resource: Resource, update: (prev: number) => number) => {
    pack[resource] = update(pack[resource]);
  };

  const applyResourceEffects = (
    resourceEffect: ResourceEffects<Resource> | undefined,
    updater: (prev: number, value: number) => number
  ) => {
    if (_.isNil(resourceEffect)) return;
    _.forEach(resourceEffect, (value, resource) => {
      updatePack(resource as Resource, (prev) => updater(prev, value ?? 0));
    });
  };

  return { pack, updatePack, applyResourceEffects };
};
