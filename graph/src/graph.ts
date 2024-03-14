import _ from "lodash";

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

type AndCond<T> = { _and: Cond<T>[] };
type OrCond<T> = { _or: Cond<T>[] };
export type Cond<T> = T | AndCond<T> | OrCond<T>;
export const condIsAnd = <T>(cond: Cond<T>): cond is AndCond<T> =>
  _.isObject(cond) && _.has(cond, "_and");
export const condIsOr = <T>(cond: Cond<T>): cond is OrCond<T> =>
  _.isObject(cond) && _.has(cond, "_or");

export const evaluateCond = <T>(
  cond: Cond<T>,
  predicate: (cond: T) => boolean
): boolean => {
  if (condIsAnd(cond))
    return cond._and.every((subCond) => evaluateCond(subCond, predicate));
  if (condIsOr(cond))
    return cond._or.some((subCond) => evaluateCond(subCond, predicate));
  return predicate(cond);
};

export const mapCond = <T>(cond: Cond<T>, mapper: (cond: T) => T): Cond<T> => {
  if (condIsAnd(cond))
    return { _and: cond._and.map((subCond) => mapCond(subCond, mapper)) };
  if (condIsOr(cond))
    return { _or: cond._or.map((subCond) => mapCond(subCond, mapper)) };
  return mapper(cond);
};

export type UnwrapCond<T> = T extends Cond<infer U> ? U : never;

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
  prep?: () => void;
  action: () => void;
  cleanup?: () => void;
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
