import { adjacentPairs, interlace, isSubArray } from "./utils.js";

describe("utils", () => {
  describe("adjacentPairs", () => {
    it("should return an empty object when given an empty array", () => {
      expect(adjacentPairs([])).toEqual({ isSolo: false, pairs: [] });
    });
    it("should return a solo item when given a single item", () => {
      expect(adjacentPairs([1])).toEqual({ isSolo: true, item: 1 });
    });
    it("should return pairs of adjacent items", () => {
      expect(adjacentPairs([1, 2, 3])).toEqual({
        isSolo: false,
        pairs: [
          [1, 2],
          [2, 3],
        ],
      });
    });
  });

  describe("interlace", () => {
    it("should return an empty an array when given an empty array", () => {
      expect(interlace([], () => "")).toEqual([]);
    });
    it("should return the array as is when given a single item", () => {
      expect(interlace(["a"], () => "x")).toEqual(["a"]);
    });
    it("should place the separator between each element", () => {
      expect(interlace(["a", "b", "c", "d", "e"], () => "x")).toEqual([
        "a",
        "x",
        "b",
        "x",
        "c",
        "x",
        "d",
        "x",
        "e",
      ]);
    });
    it("should calculate the separator based on the elements", () => {
      expect(
        interlace(["a", "b", "c", "d", "e"], (a, b) => `${a}${b}`)
      ).toEqual(["a", "ab", "b", "bc", "c", "cd", "d", "de", "e"]);
    });
  });

  describe("isSubArray", () => {
    it("should return true when the subarray is empty", () => {
      expect(isSubArray([1, 2, 3], [])).toEqual(true);
      expect(isSubArray([], [])).toEqual(true);
      expect(isSubArray([1, 1, 1, 1, 2], [1, 2])).toEqual(true);
    });
    it("should return true when the subarray is a subset of the array", () => {
      expect(isSubArray([1, 2, 3], [1])).toEqual(true);
      expect(isSubArray([1, 2, 3], [2, 3])).toEqual(true);
    });
    it("should not return true when the subarray is not a subset of the array", () => {
      expect(isSubArray([1, 2, 3], [2, 4])).toEqual(false);
      expect(isSubArray([1, 2, 3], [1, 3])).toEqual(false);
    });
    it("should not confuse substrings as subarrays", () => {
      expect(isSubArray(["tester"], ["test"])).toEqual(false);
    });
    it("should return false if the subarray is larger than the array", () => {
      expect(isSubArray([], [1])).toEqual(false);
      expect(isSubArray([1, 2, 3], [1, 2, 3, 4])).toEqual(false);
    });
  });
});
