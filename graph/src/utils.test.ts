import { adjacentPairs, interlace } from "./utils.js";

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
});
