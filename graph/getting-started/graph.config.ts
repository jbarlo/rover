// TODO nonrelative import
import { configure } from "../src";

export default configure({
  beforeEach: async () => {},
  afterEach: async () => {},
  beforeAll: async () => {},
  afterAll: async () => {},
  graph: {
    states: [{ id: "a", url: "localhost:3000" }, { id: "b" }, { id: "c" }],
    edges: [
      {
        from: "a",
        to: "b",
        name: "a->b",
        action: async (): Promise<void> => {},
      },
      {
        from: "b",
        to: "c",
        name: "b->c",
        resourceEffects: { thingies: 1 },
        action: async () => {},
      },
      {
        from: "c",
        to: "a",
        name: "c->a",
        resourceEffects: { thingies: -1 },
        action: async () => {},
      },
    ],
    resources: ["thingies"],
  },
});
