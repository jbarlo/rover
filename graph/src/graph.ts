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
type Cond<T> = T | AndCond<T> | OrCond<T>;
const condIsAnd = <T>(cond: Cond<T>): cond is AndCond<T> =>
  _.isObject(cond) && _.has(cond, "_and");
const condIsOr = <T>(cond: Cond<T>): cond is OrCond<T> =>
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

type DefinedEdgeCondition<Resource extends string> = {
  resource: Resource;
  value: number;
  operator: "lt" | "gt";
};

type EdgeCondition<Resource extends string | null> = Resource extends string
  ? Cond<DefinedEdgeCondition<Resource>>
  : undefined;

interface BaseEdge<ID extends string, Resource extends string | null = null> {
  from: ID;
  to: ID;
  name: string;
  // the changes made to resources through the action
  resourceEffects?: Resource extends string
    ? Partial<Record<Resource, number>>
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
  States extends State<string>[],
  Resource extends string | null = null
> = BaseEdge<ParseIdFromStates<States>, Resource>[];
