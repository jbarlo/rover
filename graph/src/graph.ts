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
  // TODO -- very inefficient to define reusable prep and cleanup since nav and effects
  // should be performable via UI.
  // the graph should be able to determine what resources are needed for each action,
  // then a prep path can be automatically generated before execution
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
  getEdges: () => Edges<EdgeName, S[], Resource>;
  getStates: () => S[];
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
  return {
    getEdges: () => _.cloneDeep(edges),
    getStates: () => _.cloneDeep(states),
    getResources: () => _.cloneDeep(resources),
  };
};
