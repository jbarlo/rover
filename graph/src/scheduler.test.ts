import _ from "lodash";
import { ResourceEffects, initGraph } from "./graph.js";
import {
  getConditionalPaths,
  getNonConditionalPaths,
  pathIsValid,
  runScheduler,
} from "./scheduler.js";
import { verifyCond } from "./stateCond.js";

describe("scheduler", () => {
  const goodGraph = initGraph({
    states: [
      { id: "1", url: "start" },
      { id: "2", url: "start" },
      { id: "3", url: "start" },
    ] as const,
    edges: [
      {
        from: "1",
        to: "1",
        name: "1-self-loop-x2",
        resourceEffects: { apples: 2 },
        condition: { resource: "apples", value: 4, operator: "gt" },
        action: async () => {
          console.log("1-self-loop-x2");
        },
      },
      {
        from: "1",
        to: "1",
        name: "1-self-loop",
        resourceEffects: { apples: 1 },
        action: async () => {
          console.log("1-self-loop");
        },
      },
      {
        from: "1",
        to: "2",
        name: "go-to-2",
        condition: { resource: "apples", value: 14, operator: "gt" },
        action: async () => {
          console.log("go-to-2");
        },
      },
      {
        from: "1",
        to: "3",
        name: "go-to-3-from-1",
        action: async () => {
          console.log("go-to-3-from-1");
        },
      },
      {
        from: "2",
        to: "3",
        name: "go-to-3-from-2",
        action: async () => {
          console.log("go-to-3-from-2");
        },
      },
      {
        from: "3",
        to: "1",
        name: "go-to-1-from-3",
        resourceEffects: { apples: -5 },
        action: async () => {
          console.log("go-to-1-from-3");
        },
      },
    ] as const,
    resources: ["apples", "bananas"] as const,
  });

  const resources = goodGraph.getResources();
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

  describe.concurrent("runScheduler", () => {
    describe.concurrent("getConditionalPaths", () => {
      it("should return every conditional edge if graph is satisfiable", () => {
        const result = getConditionalPaths(goodGraph);
        if (result === false) throw new Error("Graph is not satisfiable");
        const edges = goodGraph.getAllEdges();
        const conditionalEdges = _.filter(
          edges,
          (edge) => !_.isNil(edge.condition)
        );
        expect(result).toHaveLength(conditionalEdges.length);
        expect(
          _.every(
            result,
            (res) =>
              !_.isNil(
                _.find(
                  conditionalEdges,
                  (condEdge) => condEdge.name === res.edgeName
                )
              )
          )
        ).toBe(true);
      });

      it("should return a contiguous path through the graph to each conditional edge", () => {
        const result = getConditionalPaths(goodGraph);
        if (result === false) throw new Error("Graph is not satisfiable");
        const edges = goodGraph.getAllEdges();
        const keyedEdges = _.keyBy(edges, "name");
        _.each(result, (step) => {
          const pathEdges = step.path.map((p) => {
            const edge = keyedEdges[p];
            if (_.isNil(edge)) throw new Error("Edge not found");
            return edge;
          });
          // check that the first state is navigable
          expect(
            _.some(
              goodGraph.getNavigableStates(),
              (navState) => navState.id === _.first(pathEdges)!.from
            )
          ).toBe(true);
          // check every edge is contiguous
          const neighbourSteps = _.zip<
            (typeof pathEdges)[number],
            (typeof pathEdges)[number]
          >(_.initial(pathEdges), _.tail(pathEdges));
          expect(_.every(neighbourSteps, ([a, b]) => a!.to === b!.from)).toBe(
            true
          );
          // check that the last edge is the expected edge
          expect(_.last(pathEdges)!.name).toBe(step.edgeName);
        });
        expect.hasAssertions();
      });

      it("should return a path that respects the condition of the edge", () => {
        const result = getConditionalPaths(goodGraph);
        if (result === false) throw new Error("Graph is not satisfiable");

        const edges = goodGraph.getAllEdges();
        const keyedEdges = _.keyBy(edges, "name");
        _.each(result, (step) => {
          const { pack, applyResourceEffect } = preparePack();

          _.each(step.path, (pathStep) => {
            const edge = keyedEdges[pathStep];
            if (_.isNil(edge)) throw new Error("Edge not found");
            _.each(resources, (resource) => {
              expect(
                _.isNil(edge.condition) ||
                  verifyCond(pack[resource] ?? 0, resource, edge.condition)
              ).toBe(true);
            });
            applyResourceEffect(edge.resourceEffects);
          });
        });
        expect.hasAssertions();
      });
    });

    describe("getNonConditionalPaths", () => {
      it("should return a path for every nonimplicit, non-conditional edge", () => {
        const conditionalPaths = getConditionalPaths(goodGraph);
        if (conditionalPaths === false)
          throw new Error("Graph is not satisfiable");
        const nonConditionalPaths = getNonConditionalPaths(
          goodGraph,
          conditionalPaths
        );
        const nonimplicitEdges = goodGraph.getExplicitEdges();
        const nonConditionalEdges = _.filter(nonimplicitEdges, (edge) =>
          _.isNil(edge.condition)
        );
        expect(nonConditionalPaths).toHaveLength(nonConditionalEdges.length);
        expect(
          _.every(
            nonConditionalPaths,
            (res) =>
              !_.isNil(
                _.find(
                  nonConditionalEdges,
                  (condEdge) => condEdge.name === res.edgeName
                )
              )
          )
        ).toBe(true);
      });

      it("should return a contiguous path through the graph to each non-conditional edge", () => {
        const conditionalPaths = getConditionalPaths(goodGraph);
        if (conditionalPaths === false)
          throw new Error("Graph is not satisfiable");
        const nonConditionalPaths = getNonConditionalPaths(
          goodGraph,
          conditionalPaths
        );
        const edges = goodGraph.getAllEdges();
        const keyedEdges = _.keyBy(edges, "name");
        _.each(nonConditionalPaths, (step) => {
          const pathEdges = step.path.map((p) => {
            const edge = keyedEdges[p];
            if (_.isNil(edge)) throw new Error("Edge not found");
            return edge;
          });
          // check that the first state is navigable
          expect(
            _.some(
              goodGraph.getNavigableStates(),
              (navState) => navState.id === _.first(pathEdges)!.from
            )
          ).toBe(true);
          // check every edge is contiguous
          const neighbourSteps = _.zip<
            (typeof pathEdges)[number],
            (typeof pathEdges)[number]
          >(_.initial(pathEdges), _.tail(pathEdges));
          expect(_.every(neighbourSteps, ([a, b]) => a!.to === b!.from)).toBe(
            true
          );
          // check that the last edge is the expected edge
          expect(_.last(pathEdges)!.name).toBe(step.edgeName);
        });
        expect.hasAssertions();
      });

      it("should return a path that respects the condition of the edge", () => {
        const conditionalPaths = getConditionalPaths(goodGraph);
        if (conditionalPaths === false)
          throw new Error("Graph is not satisfiable");
        const nonConditionalPaths = getNonConditionalPaths(
          goodGraph,
          conditionalPaths
        );
        const edges = goodGraph.getAllEdges();
        const keyedEdges = _.keyBy(edges, "name");
        _.each(nonConditionalPaths, (step) => {
          const { pack, applyResourceEffect } = preparePack();

          _.each(step.path, (pathStep) => {
            const edge = keyedEdges[pathStep];
            if (_.isNil(edge)) throw new Error("Edge not found");
            _.each(resources, (resource) => {
              expect(
                _.isNil(edge.condition) ||
                  verifyCond(pack[resource] ?? 0, resource, edge.condition)
              ).toBe(true);
            });
            applyResourceEffect(edge.resourceEffects);
          });
        });
        expect.hasAssertions();
      });

      it("should return a path that respects the condition of the edge, on a pathological case", () => {
        // construct a graph that produces a case where the path for one
        // conditional edge is shorter than the path for another conditional
        // edge, but the shorter path if taken does not respect edge conditions
        const minimalGraph = initGraph({
          states: [
            { id: "1" },
            { id: "2" },
            { id: "3", url: "start" },
          ] as const,
          edges: [
            {
              from: "1",
              to: "1",
              name: "1-self-loop-x2",
              resourceEffects: { apples: 2 },
              condition: { resource: "apples", value: 4, operator: "gt" },
              action: async () => {
                console.log("1-self-loop-x2");
              },
            },
            {
              from: "1",
              to: "1",
              name: "1-self-loop",
              resourceEffects: { apples: 1 },
              action: async () => {
                console.log("1-self-loop");
              },
            },
            {
              from: "1",
              to: "2",
              name: "go-to-2",
              condition: { resource: "apples", value: 14, operator: "gt" },
              action: async () => {
                console.log("go-to-2");
              },
            },
            {
              from: "2",
              to: "3",
              name: "go-to-3-from-2",
              action: async () => {
                console.log("go-to-3-from-2");
              },
            },
            {
              from: "3",
              to: "1",
              name: "go-to-1-from-3",
              resourceEffects: { apples: -15 },
              action: async () => {
                console.log("go-to-1-from-3");
              },
            },
          ] as const,
          resources: ["apples" as const],
        });
        const minimalResources = minimalGraph.getResources();

        const conditionalPaths = getConditionalPaths(minimalGraph);
        if (conditionalPaths === false)
          throw new Error("Graph is not satisfiable");
        const nonConditionalPaths = getNonConditionalPaths(
          minimalGraph,
          conditionalPaths
        );
        const edges = minimalGraph.getAllEdges();
        const keyedEdges = _.keyBy(edges, "name");
        _.each(nonConditionalPaths, (step) => {
          const { pack, applyResourceEffect } = preparePack();
          _.each(step.path, (pathStep) => {
            const edge = keyedEdges[pathStep];
            if (_.isNil(edge)) throw new Error("Edge not found");
            _.each(minimalResources, (resource) => {
              expect(
                _.isNil(edge.condition) ||
                  verifyCond(pack[resource] ?? 0, resource, edge.condition)
              ).toBe(true);
            });
            applyResourceEffect(edge.resourceEffects);
          });
        });
        expect.hasAssertions();
      });
    });

    describe("pathIsValid", () => {
      const validationGraph = initGraph({
        states: [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }] as const,
        edges: [
          {
            from: "1",
            to: "2",
            name: "1-to-2",
            action: async () => {
              console.log("1-to-2");
            },
          },
          {
            from: "2",
            to: "3",
            name: "2-to-3",
            action: async () => {
              console.log("2-to-3");
            },
          },
          {
            from: "3",
            to: "2",
            name: "3-to-2",
            resourceEffects: { apples: 1 },
            action: async () => {
              console.log("3-to-2");
            },
          },
          {
            from: "3",
            to: "4",
            name: "3-to-4",
            condition: { resource: "apples", value: 1, operator: "gt" },
            action: async () => {
              console.log("3-to-4");
            },
          },
          {
            from: "4",
            to: "4",
            name: "4-to-4",
            resourceEffects: { apples: -1 },
            action: async () => {
              console.log("4-to-4");
            },
          },
        ] as const,
        resources: ["apples" as const],
      });

      it("should return false if there is no contiguous path through the graph", () => {
        expect(
          pathIsValid(validationGraph, [
            { edgeName: "1-to-2", type: "action" },
            // path jumps
            { edgeName: "3-to-4", type: "action" },
            // path jumps
            { edgeName: "2-to-3", type: "action" },
            { edgeName: "3-to-2", type: "action" },
            { edgeName: "4-to-4", type: "action" },
            { edgeName: "4-to-4", type: "cleanup" },
          ])
        ).toBe(false);
      });

      it("should return false if conditional edges are not respected", () => {
        expect(
          pathIsValid(validationGraph, [
            { edgeName: "1-to-2", type: "action" },
            { edgeName: "2-to-3", type: "action" },
            { edgeName: "3-to-2", type: "action" },
            { edgeName: "2-to-3", type: "prep" },
            // fails to loop twice
            { edgeName: "3-to-4", type: "action" },
            { edgeName: "4-to-4", type: "action" },
            { edgeName: "4-to-4", type: "cleanup" },
          ])
        ).toBe(false);
      });

      it("should return false if steps don't end with an empty pack", () => {
        expect(
          pathIsValid(validationGraph, [
            { edgeName: "1-to-2", type: "action" },
            { edgeName: "2-to-3", type: "action" },
            { edgeName: "3-to-2", type: "action" },
            { edgeName: "2-to-3", type: "prep" },
            { edgeName: "3-to-2", type: "prep" },
            { edgeName: "2-to-3", type: "prep" },
            { edgeName: "3-to-4", type: "action" },
            { edgeName: "4-to-4", type: "action" },
            // doesn't fully cleanup
          ])
        ).toBe(false);
      });

      it("should return false if every edge doesn't have exactly one 'action' step", () => {
        expect(
          pathIsValid(validationGraph, [
            { edgeName: "1-to-2", type: "action" },
            { edgeName: "2-to-3", type: "action" },
            { edgeName: "3-to-2", type: "action" },
            { edgeName: "2-to-3", type: "action" },
            // second 3-to-2
            { edgeName: "3-to-2", type: "action" },
            // second 2-to-3
            { edgeName: "2-to-3", type: "action" },
            { edgeName: "3-to-4", type: "action" },
            { edgeName: "4-to-4", type: "action" },
            // second 4-to-4
            { edgeName: "4-to-4", type: "action" },
          ])
        ).toBe(false);
      });

      it("should return true if all validations pass", () => {
        expect(
          pathIsValid(validationGraph, [
            { edgeName: "1-to-2", type: "action" },
            { edgeName: "2-to-3", type: "action" },
            { edgeName: "3-to-2", type: "action" },
            { edgeName: "2-to-3", type: "prep" },
            { edgeName: "3-to-2", type: "prep" },
            { edgeName: "2-to-3", type: "prep" },
            { edgeName: "3-to-4", type: "action" },
            { edgeName: "4-to-4", type: "action" },
            { edgeName: "4-to-4", type: "cleanup" },
          ])
        ).toBe(true);
      });
    });

    const prepSteps = () => {
      const steps = runScheduler(goodGraph);
      const edges = goodGraph.getAllEdges();
      return steps.map((step) => {
        const edge = edges[step.edgeName];
        if (_.isNil(edge)) throw new Error("Edge not found");
        return { ...step, edge };
      });
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
      const steps = runScheduler(goodGraph);
      const actionSteps = steps.filter((step) => step.type === "action");
      const edges = goodGraph.getExplicitEdges();
      expect(actionSteps).toHaveLength(_.size(edges));
      // all unique names
      expect(_.uniqBy(actionSteps, "edgeName")).toHaveLength(
        actionSteps.length
      );
    });
  });
});
