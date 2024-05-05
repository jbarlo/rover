import _ from "lodash";
import {
  ResourceEffects,
  createEdges,
  createStates,
  initGraph,
} from "./graph.js";
import { runScheduler } from "./scheduler.js";
import { verifyCond } from "./stateCond.js";

describe("scheduler", () => {
  describe.concurrent("runScheduler", () => {
    const states = createStates([
      { id: "1", url: "start" },
      { id: "2" },
      { id: "3" },
    ]);

    const resources = ["apples" as const, "bananas" as const];

    const edges = createEdges(
      [
        {
          from: "1",
          to: "1",
          name: "1-self-loop-x2",
          resourceEffects: { apples: 2 },
          condition: { resource: "apples", value: 4, operator: "gt" },
          action: () => {
            console.log("1-self-loop-x2");
          },
        },
        {
          from: "1",
          to: "1",
          name: "1-self-loop",
          resourceEffects: { apples: 1 },
          action: () => {
            console.log("1-self-loop");
          },
        },
        {
          from: "1",
          to: "2",
          name: "go-to-2",
          condition: { resource: "apples", value: 14, operator: "gt" },
          action: () => {
            console.log("go-to-2");
          },
        },
        {
          from: "1",
          to: "3",
          name: "go-to-3-from-1",
          action: () => {
            console.log("go-to-3-from-1");
          },
        },
        {
          from: "2",
          to: "3",
          name: "go-to-3-from-2",
          action: () => {
            console.log("go-to-3-from-2");
          },
        },
        {
          from: "3",
          to: "1",
          name: "go-to-1-from-3",
          resourceEffects: { apples: -5 },
          action: () => {
            console.log("go-to-1-from-3");
          },
        },
      ],
      states,
      resources
    );

    const graph = initGraph(states, edges, resources);

    const prepSteps = () => {
      const steps = runScheduler(graph);
      const keyedEdges = _.keyBy(edges, "name");
      return steps.map((step) => {
        const edge = keyedEdges[step.edgeName];
        if (_.isNil(edge)) throw new Error("Edge not found");
        return { ...step, edge };
      });
    };

    type Resource = (typeof resources)[number];
    const preparePack = () => {
      const pack: Partial<Record<Resource, number>> = {};
      const applyResourceEffect = (
        resourceEffect: ResourceEffects<Resource> | undefined
      ) => {
        _.each(resources, (resource) => {
          const value = resourceEffect?.[resource];
          if (_.isNil(value)) return;
          pack[resource] = (pack[resource] ?? 0) + value;
        });
      };
      return { pack, applyResourceEffect };
    };

    it("should produce a contiguous path through the graph", () => {
      const stepsWithEdges = prepSteps();
      const neighbourSteps = _.zip<
        (typeof stepsWithEdges)[number],
        (typeof stepsWithEdges)[number]
      >(_.initial(stepsWithEdges), _.tail(stepsWithEdges));
      expect(
        _.every(neighbourSteps, ([a, b]) => a!.edge.to === b!.edge.from)
      ).toBe(true);
    });

    it("should produce steps that respect conditional edges", () => {
      const stepsWithEdges = prepSteps();

      const { pack, applyResourceEffect } = preparePack();

      _.each(stepsWithEdges, (step) => {
        _.each(resources, (resource) => {
          expect(
            _.isNil(step.edge.condition) ||
              verifyCond(pack[resource] ?? 0, resource, step.edge.condition)
          ).toBe(true);
        });
        applyResourceEffect(step.edge.resourceEffects);
      });
      expect.hasAssertions();
    });

    it("should produce steps that empty the pack by the final step", () => {
      const stepsWithEdges = prepSteps();

      const { pack, applyResourceEffect } = preparePack();

      _.each(stepsWithEdges, (step) => {
        applyResourceEffect(step.edge.resourceEffects);
      });
      expect(_.every(pack, (value) => _.isNil(value) || value === 0)).toBe(
        true
      );
    });

    it("should produce exactly one action step for every edge", () => {
      const steps = runScheduler(graph);
      const actionSteps = steps.filter((step) => step.type === "action");
      expect(actionSteps).toHaveLength(edges.length);
      // all unique names
      expect(_.uniqBy(actionSteps, "edgeName")).toHaveLength(
        actionSteps.length
      );
    });
  });
});
