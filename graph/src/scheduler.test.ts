import _ from "lodash";
import {
  ResourceEffects,
  createEdges,
  createStates,
  initGraph,
} from "./graph.js";
import {
  getConditionalPaths,
  getNonConditionalPaths,
  runScheduler,
} from "./scheduler.js";
import { verifyCond } from "./stateCond.js";

describe("scheduler", () => {
  const states = createStates([
    { id: "1" },
    { id: "2", url: "start" },
    { id: "3" },
  ]);

  const resources = ["apples" as const, "bananas" as const];

  const e = createEdges(
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

  const goodGraph = initGraph(states, e, resources);

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
        const edges = goodGraph.getEdges();
        const conditionalEdges = edges.filter(
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
        const edges = goodGraph.getEdges();
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

        const edges = goodGraph.getEdges();
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
        const nonimplicitEdges = goodGraph.getEdges(true);
        const nonConditionalEdges = nonimplicitEdges.filter((edge) =>
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
        const edges = goodGraph.getEdges();
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
        const edges = goodGraph.getEdges();
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
    });

    const prepSteps = () => {
      const steps = runScheduler(goodGraph);
      const edges = goodGraph.getEdges();
      const keyedEdges = _.keyBy(edges, "name");
      return steps.map((step) => {
        const edge = keyedEdges[step.edgeName];
        if (_.isNil(edge)) throw new Error("Edge not found");
        return { ...step, edge };
      });
    };

    // TODO NEXT STEPS: something is broken with nonConditionalPaths:
    //  "go-to-1-from-3" doesn't find a path leaving from 2

    it("should produce a contiguous path through the graph", () => {
      const stepsWithEdges = prepSteps();
      const neighbourSteps = _.zip<
        (typeof stepsWithEdges)[number],
        (typeof stepsWithEdges)[number]
      >(_.initial(stepsWithEdges), _.tail(stepsWithEdges));

      onTestFailed(() => {
        console.log(stepsWithEdges);
        console.log(
          _.find(neighbourSteps, ([a, b]) => a!.edge.to !== b!.edge.from)
        );
      });

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
      const edges = goodGraph.getEdges();
      expect(actionSteps).toHaveLength(edges.length);
      // all unique names
      expect(_.uniqBy(actionSteps, "edgeName")).toHaveLength(
        actionSteps.length
      );
    });
  });
});
