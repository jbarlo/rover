import _ from "lodash";
import { Cond } from "./cond.js";

interface State<ID extends string> {
  id: ID;
  // the state's canonical url, if it exists
  // TODO find a way to handle *static-er* slugs
  url?: string;
  navigable?: boolean;
}

export const createStates = <ID extends string>(states: State<ID>[]) => {
  return states;
};

type ParseIdFromStates<T extends State<string>[]> = T[number] extends State<
  infer ID
>
  ? ID
  : never;

type DefinedEdgeCondition<Resource extends string> = {
  resource: Resource;
  value: number;
  operator: "lt" | "gt";
};

type EdgeCondition<Resource extends string | null> = Resource extends string
  ? Cond<DefinedEdgeCondition<Resource>>
  : undefined;

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
  condition?: EdgeCondition<Resource>;
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
> = BaseEdge<EdgeName, ParseIdFromStates<States>, Resource>[];

export const createEdges = <
  EdgeName extends string,
  States extends State<string>[],
  Resource extends string | undefined = undefined
>(
  edges: Edges<EdgeName, States, Resource extends undefined ? null : Resource>,
  states: States,
  resources?: Resource[]
) => {
  return edges;
};
