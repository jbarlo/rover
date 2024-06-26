import _ from "lodash";

type AndCond<T> = { _and: Cond<T>[] };
type OrCond<T> = { _or: Cond<T>[] };
export type Cond<T> = T | AndCond<T> | OrCond<T>;
export const condIsAnd = <T>(cond: Cond<T>): cond is AndCond<T> =>
  _.isObject(cond) && _.has(cond, "_and");
export const condIsOr = <T>(cond: Cond<T>): cond is OrCond<T> =>
  _.isObject(cond) && _.has(cond, "_or");
export const condIsLeaf = <T>(cond: Cond<T>): cond is T =>
  !condIsAnd(cond) && !condIsOr(cond);

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

export const mapCondArr = <T>(
  conds: Cond<T>[],
  mapper: (conds: Cond<T>[], parentType: "and" | "or") => Cond<T>[],
  parentType: "and" | "or",
  flattenSolo: boolean
): Cond<T>[] => {
  const mappedChildren = _.map(conds, (cond) => {
    if (condIsAnd(cond)) {
      const mapped = mapCondArr(cond._and, mapper, "and", flattenSolo);
      if (flattenSolo && mapped.length === 1) return mapped[0]!;
      return { _and: mapped };
    }
    if (condIsOr(cond)) {
      const mapped = mapCondArr(cond._or, mapper, "or", flattenSolo);
      if (flattenSolo && mapped.length === 1) return mapped[0]!;
      return { _or: mapped };
    }
    return cond;
  });
  return mapper(mappedChildren, parentType);
};

export const flattenSoloCond = <T>(cond: Cond<T>): Cond<T> => {
  if (condIsAnd(cond))
    return cond._and.length === 1
      ? flattenSoloCond(cond._and[0]!)
      : { _and: _.map(cond._and, (c) => flattenSoloCond(c)) };
  if (condIsOr(cond))
    return cond._or.length === 1
      ? flattenSoloCond(cond._or[0]!)
      : { _or: _.map(cond._or, (c) => flattenSoloCond(c)) };
  return cond;
};

export const combineCond = <T>(cond: Cond<T>): Cond<T> => {
  const helper = <T>(conds: Cond<T>[], parentType: "and" | "or"): Cond<T>[] =>
    _.flatMap(conds, (c) => {
      if (parentType === "and") {
        if (condIsAnd(c)) return helper(c._and, "and");
        if (condIsOr(c))
          return [{ _or: _.flatMap(c._or, (cc) => helper([cc], "or")) }];
      } else {
        if (condIsAnd(c))
          return [{ _and: _.flatMap(c._and, (cc) => helper([cc], "and")) }];
        if (condIsOr(c)) return helper(c._or, "or");
      }
      return [_.cloneDeep(c)];
    });

  if (condIsAnd(cond)) return { _and: helper(cond._and, "and") };
  if (condIsOr(cond)) return { _or: helper(cond._or, "or") };
  return _.cloneDeep(cond);
};

export const flattenCond = <T>(cond: Cond<T>): T[] => {
  if (condIsAnd(cond)) return _.flatMap(cond._and, flattenCond);
  if (condIsOr(cond)) return _.flatMap(cond._or, flattenCond);
  return [cond];
};

export const prettyPrintEdgeCondition = <T>(
  cond: Cond<T>,
  printer: (cond: T) => string
): string => {
  if (condIsAnd(cond))
    return `(${cond._and
      .map((c) => prettyPrintEdgeCondition(c, printer))
      .join(" && ")})`;
  if (condIsOr(cond))
    return `(${cond._or
      .map((c) => prettyPrintEdgeCondition(c, printer))
      .join(" || ")})`;
  return printer(cond);
};
