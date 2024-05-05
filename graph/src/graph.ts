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

type ParseIdFromState<T extends State<string>> = T extends State<infer ID>
  ? ID
  : never;

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
> = BaseEdge<EdgeName, ParseIdFromState<States[number]>, Resource>[];

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

export interface Graph<
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
> {
  getEdges: (excludeImplicit?: boolean) => Edges<EdgeName, S[], Resource>;
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
  const getStates = () => _.cloneDeep(states);
  const getNavigableStates = () => getStates().filter((s) => !_.isNil(s.url));

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
  ) as typeof edges; // TODO fix
  const getEdges = (excludeImplicit = false) =>
    excludeImplicit
      ? _.cloneDeep(edges)
      : [..._.cloneDeep(edges), ...implicitEdges];
  return {
    getEdges,
    getStates,
    getNavigableStates,
    getResources: () => _.cloneDeep(resources),
  };
};
