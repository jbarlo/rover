import _ from "lodash";

export const adjacentPairs = <T>(
  arr: T[]
): { isSolo: true; item: T } | { isSolo: false; pairs: [T, T][] } => {
  if (arr.length === 1) return { isSolo: true, item: arr[0] as T };
  return {
    isSolo: false,
    pairs: _.zip(_.initial(arr), _.tail(arr)) as [T, T][],
  };
};

export const interlace = <T>(
  arr: T[],
  getSep: (before: T, after: T) => T
): T[] => {
  const pairs = adjacentPairs(arr);
  if (pairs.isSolo) return [pairs.item];
  return _.flatMap(pairs.pairs, ([before, after], i) =>
    _.compact([
      before,
      getSep(before, after),
      // append last item if last pair
      i >= pairs.pairs.length - 1 ? after : null,
    ])
  );
};
