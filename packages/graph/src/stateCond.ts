import { EdgeCondition, ResourceEffects } from "./graph.js";
import {
  Cond,
  combineCond,
  condIsLeaf,
  evaluateCond,
  flattenCond,
  flattenSoloCond,
  mapCond,
  mapCondArr,
  prettyPrintEdgeCondition,
} from "./cond.js";
import _ from "lodash";

export const prettyPrint = <R extends string>(
  condition: Cond<EdgeCondition<R> | boolean>
) =>
  prettyPrintEdgeCondition(condition, (c) =>
    _.isBoolean(c)
      ? c.toString()
      : `${c.operator === "gt" ? ">" : "<"} ${c.value} ${c.resource}`
  );

export const propagateCondition = <R extends string>(
  cond: Cond<EdgeCondition<R> | boolean>,
  resourceEffects: ResourceEffects<R> | undefined,
  propagate: (packValue: number, effectValue: number) => number
): Cond<EdgeCondition<R> | boolean> => {
  return mapCond(cond, (c) => {
    if (_.isBoolean(c) || _.isNil(resourceEffects)) return c;
    const resourceEffect: number | undefined = resourceEffects[c.resource];
    if (_.isNil(resourceEffect)) return c;
    return { ...c, value: propagate(c.value, resourceEffect) };
  });
};

export const verifyCond = <R extends string>(
  value: number,
  resource: R,
  cond: Cond<EdgeCondition<R> | boolean>
): boolean =>
  evaluateCond(cond, (c) => {
    if (_.isBoolean(c)) return c;
    if (c.resource === resource) {
      if (c.operator === "lt") return value < c.value;
      if (c.operator === "gt") return value > c.value;
    }
    return true;
  });

export const edgeConditionIsSatisfiable = <R extends string>(
  cond: Cond<EdgeCondition<R> | boolean>
): boolean => {
  const flattenedConditions: (EdgeCondition<R> | boolean)[] = flattenCond(cond);

  const sets: Partial<Record<R, Set<number>>> = {};
  const addToSet = (resource: R, value: number) => {
    if (!sets[resource]) sets[resource] = new Set();
    sets[resource]?.add(value);
  };

  _.forEach(flattenedConditions, (c) => {
    if (_.isBoolean(c)) return;
    addToSet(c.resource, c.value);
  });

  try {
    _.forEach(sets, (set, resource) => {
      if (_.isNil(set) || set.size <= 0) return true; // skip empty sets
      const orderedValues = _.sortBy(Array.from(set));
      const shiftedDownByOne = _.map(orderedValues, (v) => v - 1);
      // appease TS, orderedValues always contains at least 1 value
      const finalShiftedUpOne = _.last(orderedValues)! + 1;
      const testValues = _.uniq([
        ...orderedValues,
        ...shiftedDownByOne,
        finalShiftedUpOne,
      ]);

      if (_.every(testValues, (v) => !verifyCond(v, resource as R, cond))) {
        throw new Error("Invalid condition");
      }
    });
  } catch (e) {
    return false;
  }

  return true;
};

export type HorizonEdgeCondition<R extends string> =
  | Cond<EdgeCondition<R> | boolean>
  | undefined;

// TODO test
// TODO determine numeric ranges and reconstruct a cond
export const simplifyHorizonEdgeCond = <R extends string>(
  cond: HorizonEdgeCondition<R>
): HorizonEdgeCondition<R> => {
  if (_.isNil(cond)) return undefined;

  const combinedCond = combineCond(cond);

  const mappedCond = {
    _and: mapCondArr(
      [combinedCond],
      (conds, parentType) => {
        if (parentType === "and") {
          if (_.some(conds, (c) => c === false)) return [false];
          // defines the highest and lowest valid value boundary for each
          // resource. if a value is defined, values *beyond* that value are
          // valid. if a resource is not defined, all values are valid.
          const bounds: Partial<
            Record<R, { highest: number; lowest: number }>
          > = {};
          const setBoundary = (
            resource: R,
            type: "high" | "low",
            value: number
          ) => {
            const boundary = _.cloneDeep(bounds[resource]) ?? {
              highest: Infinity,
              lowest: -Infinity,
            };
            if (type === "high") {
              boundary.highest = Math.min(boundary.highest, value);
            } else {
              boundary.lowest = Math.max(boundary.lowest, value);
            }
            bounds[resource] = boundary;
            return boundary;
          };
          try {
            _.forEach(conds, (c) => {
              if (_.isBoolean(c)) return true; // continue
              if (!condIsLeaf(c)) return true; // continue
              const newBoundary = setBoundary(
                c.resource,
                c.operator === "lt" ? "high" : "low",
                c.value
              );
              if (newBoundary.highest <= newBoundary.lowest)
                throw new Error("Invalid cond");
            });
          } catch {
            return [false];
          }

          const newConds: typeof conds = _.compact(
            _.flatMap(
              bounds,
              (
                boundary: (typeof bounds)[keyof typeof bounds],
                resource: keyof typeof bounds
              ) => {
                if (_.isNil(boundary)) return undefined;

                const lowerBound =
                  boundary.lowest > -Infinity
                    ? { resource, value: boundary.lowest, operator: "gt" }
                    : undefined;
                const upperBound =
                  boundary.highest < Infinity
                    ? { resource, value: boundary.highest, operator: "lt" }
                    : undefined;

                return [lowerBound, upperBound];
              }
            )
          );

          return [..._.filter(conds, (c) => !condIsLeaf(c)), ...newConds];
        }

        if (_.some(conds, (c) => c === true)) return [true];
        // defines the highest and lowest valid value boundary for each
        // resource. all values *outside* of that boundary are valid. if a
        // resource is not defined, no values are valid.
        const bounds: Partial<Record<R, { highest: number; lowest: number }>> =
          {};
        const setBoundary = (
          resource: R,
          type: "high" | "low",
          value: number
        ) => {
          const boundary = _.cloneDeep(bounds[resource]) ?? {
            highest: Infinity,
            lowest: -Infinity,
          };
          if (type === "high") {
            boundary.highest = Math.min(boundary.highest, value);
          } else {
            boundary.lowest = Math.max(boundary.lowest, value);
          }
          bounds[resource] = boundary;
          return boundary;
        };
        try {
          _.forEach(conds, (c) => {
            if (_.isBoolean(c)) return true; // continue
            if (!condIsLeaf(c)) return true; // continue
            const newBoundary = setBoundary(
              c.resource,
              c.operator === "lt" ? "high" : "low",
              c.value
            );
            if (newBoundary.highest <= newBoundary.lowest)
              throw new Error("Tautology found");
          });
        } catch {
          return [true];
        }

        const newConds: typeof conds = _.compact(
          _.flatMap(
            bounds,
            (
              boundary: (typeof bounds)[keyof typeof bounds],
              resource: keyof typeof bounds
            ) => {
              if (_.isNil(boundary)) return undefined;

              const lowerBound =
                boundary.lowest > -Infinity
                  ? { resource, value: boundary.lowest, operator: "lt" }
                  : undefined;
              const upperBound =
                boundary.highest < Infinity
                  ? { resource, value: boundary.highest, operator: "gt" }
                  : undefined;

              return [lowerBound, upperBound];
            }
          )
        );

        return [..._.filter(conds, (c) => !condIsLeaf(c)), ...newConds];
      },
      "and",
      true
    ),
  };

  return flattenSoloCond(mappedCond);
};
