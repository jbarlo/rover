import _ from "lodash";
import { Cond } from "./cond.js";
import { ZodLiteral, ZodUnion, z } from "zod";

type SoloOrUnionSchema<I> =
  | ZodUnion<[ZodLiteral<I>, ZodLiteral<I>, ...ZodLiteral<I>[]]>
  | ZodLiteral<I>;
const soloOrUnion = <T, I extends string>(
  elements: T[],
  getter: (t: T) => I
): SoloOrUnionSchema<I> => {
  if (elements.length < 1) throw new Error("Must have at least one element");
  if (elements.length === 1) return z.literal(getter(elements[0]!));
  return z.union([
    z.literal(getter(elements[0]!)),
    z.literal(getter(elements[1]!)),
    ...elements.slice(2).map((s) => z.literal(getter(s))),
  ]);
};

export interface State<ID extends string> {
  id: ID;
  // the state's canonical url, if it exists
  // TODO find a way to handle *static-er* slugs
  url?: string;
  navigable?: boolean;
}
const makeStateSchema = <T extends SoloOrUnionSchema<any>>(stateIdSchema: T) =>
  z.object({
    id: stateIdSchema,
    url: z.string().optional(),
    navigable: z.boolean().optional(),
  });

export type EdgeCondition<Resource extends string> = {
  resource: Resource;
  value: number;
  operator: "lt" | "gt";
};
const makeEdgeConditionSchema = <T extends SoloOrUnionSchema<any>>(
  resourceSchema: T
) =>
  z.object({
    resource: resourceSchema,
    value: z.number(),
    operator: z.literal("lt").or(z.literal("gt")),
  });

export type ResourceEffects<R extends string> = Partial<Record<R, number>>;

interface BaseEdge<
  EdgeName extends string,
  ID extends string,
  Resource extends string | null = null
> {
  from: ID;
  to: ID;
  name: EdgeName;
  // the changes made to resources through the action
  resourceEffects?: Resource extends string
    ? ResourceEffects<Resource>
    : undefined;
  condition?: Resource extends string
    ? Cond<EdgeCondition<Resource>>
    : undefined;
  action: () => void;
}
const makeEdgeSchema = <
  StateIdSchema extends SoloOrUnionSchema<any>,
  EdgeNameSchema extends SoloOrUnionSchema<any>,
  ResourceSchema extends SoloOrUnionSchema<any>
>(
  stateIdSchema: StateIdSchema,
  edgeNameSchema: EdgeNameSchema,
  resourceSchema: ResourceSchema
) =>
  z.object({
    from: stateIdSchema,
    to: stateIdSchema,
    name: edgeNameSchema,
    // z.record is partial
    resourceEffects: z.record(resourceSchema, z.number()).optional(),
    condition: makeEdgeConditionSchema(resourceSchema).optional(),
    action: z.function(),
  });

export type Edges<
  EdgeName extends string,
  States extends State<string>[],
  Resource extends string | null = null
> = BaseEdge<EdgeName, States[number]["id"], Resource>[];

// TODO nice things for a not a monad -- all clones of the actual underlying
// - keyed edges -- with 1-to-1 guarantees
// - keyed states -- with 1-to-1 guarantees
// - starting states (keyed maybe)
// - all resources
type ImplicitEdge<StateId extends string> = `implicit-${StateId}-to-${StateId}`;

type GetEdgesResult<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> = Record<EdgeName, BaseEdge<EdgeName, StateId, Resource>>;
export type AllEdgesResult<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> = GetEdgesResult<StateId, EdgeName | ImplicitEdge<StateId>, Resource>;
export type OnlyExplicitEdgesResult<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> = GetEdgesResult<StateId, EdgeName, Resource>;
type GetEdges<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> = {
  (excludeImplicit?: false): AllEdgesResult<StateId, EdgeName, Resource>;
  (excludeImplicit: true): OnlyExplicitEdgesResult<StateId, EdgeName, Resource>;
};

export const makeGraphInputSchema = <
  StateIdSchema extends SoloOrUnionSchema<any>,
  EdgeNameSchema extends SoloOrUnionSchema<any>,
  ResourceSchema extends SoloOrUnionSchema<any>
>(
  stateIdSchema: StateIdSchema,
  edgeNameSchema: EdgeNameSchema,
  resourceSchema: ResourceSchema
) =>
  z
    .object({
      states: makeStateSchema(stateIdSchema).array().nonempty(),
      edges: makeEdgeSchema(stateIdSchema, edgeNameSchema, resourceSchema)
        .array()
        .nonempty(),
      resources: resourceSchema.array(),
    })
    .superRefine((data, ctx) => {
      if (data.states.length !== _.uniqBy(data.states, "id").length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate state ids",
          path: ["states"],
        });
      }
      if (data.edges.length !== _.uniqBy(data.edges, "name").length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate edge names",
          path: ["edges"],
        });
      }

      return data;
    });
export interface GraphConfInput<
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
> {
  states: S[];
  edges: Edges<EdgeName, S[], Resource>;
  resources: Resource[];
}

export const makeGraphInputSchemaFromInputLiterals = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  graphConf: GraphConfInput<StateId, S, EdgeName, Resource>
) => {
  const stateIdSchema = soloOrUnion(graphConf.states, (s) => s.id);
  const edgeNameSchema = soloOrUnion(graphConf.edges, (e) => e.name);
  const resourceSchema = soloOrUnion(graphConf.resources, (r) => r);
  return makeGraphInputSchema(stateIdSchema, edgeNameSchema, resourceSchema);
};

export interface Graph<
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
> {
  getEdges: GetEdges<StateId, EdgeName, Resource>;
  getImplicitEdges: () => BaseEdge<ImplicitEdge<StateId>, StateId, Resource>[];
  getStates: () => S[];
  getNavigableStates: () => S[];
  getResources: () => Resource[];
}
// TODO ensure generics are always string literals
export const initGraph: <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  conf: GraphConfInput<StateId, S, EdgeName, Resource>
) => Graph<StateId, S, EdgeName, Resource> = (conf) => {
  const { states, edges, resources } = conf;
  type Resource = (typeof resources)[number];
  type StateId = (typeof states)[number]["id"];
  type S = (typeof states)[number];
  type EdgeName = (typeof edges)[number]["name"];

  // TODO make resource output type infer generic type properly
  const schema = makeGraphInputSchemaFromInputLiterals<
    StateId,
    S,
    EdgeName,
    Resource
  >(conf);
  // Validate
  // TODO replace this func with a transform
  schema.parse(conf);

  const getStates = () => _.cloneDeep(states);
  const getNavigableStates = () => getStates().filter((s) => !_.isNil(s.url));

  // TODO implicit edges with effects -- will affect path stitching
  const implicitEdges = _.flatMap(getNavigableStates(), (navState) =>
    _.compact(
      _.map(getStates(), (otherState) => {
        if (navState.id === otherState.id) return null;
        const implicitEdge = {
          from: otherState.id,
          to: navState.id,
          // TODO guarantee uniqueness
          name: `implicit-${otherState.id}-to-${navState.id}` as const,
          // TODO internal type to avoid action?
          action: () => {},
        };
        return implicitEdge;
      })
    )
  );

  const getImplicitEdges = () => _.cloneDeep(implicitEdges);

  const getEdges: GetEdges<StateId, EdgeName, Resource> = (
    excludeImplicit = false
  ) => {
    if (excludeImplicit) {
      const toReturn = _.keyBy(
        _.cloneDeep(edges),
        "name"
      ) as OnlyExplicitEdgesResult<StateId, EdgeName, Resource>; // TODO typing
      return toReturn as any; // concession for function overload
    }
    const toReturn = _.keyBy(
      [..._.cloneDeep(edges), ...getImplicitEdges()],
      "name"
    ) as AllEdgesResult<StateId, EdgeName, Resource>; // TODO typing
    return toReturn as any; // concession for function overload
  };

  return {
    getEdges,
    getImplicitEdges,
    getStates,
    getNavigableStates,
    getResources: () => _.cloneDeep(resources),
  };
};

export type ValueOf<T> = T[keyof T];

export type AllEdgeNames<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> = ValueOf<AllEdgesResult<StateId, EdgeName, Resource>>["name"];

export const preparePack = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>,
  initialPack?: Partial<Record<Resource, number>>
) => {
  const emptyPack = _.mapValues(
    _.keyBy(graph.getResources(), (r) => r),
    () => 0
  ) as Record<Resource, number>; // TODO typing
  const pack: Record<Resource, number> = {
    ...emptyPack,
    ..._.omitBy(initialPack, (v) => _.isNil(v)),
  };

  const updatePack = (resource: Resource, update: (prev: number) => number) => {
    pack[resource] = update(pack[resource]);
  };

  const applyResourceEffects = (
    resourceEffect: ResourceEffects<Resource> | undefined,
    updater: (prev: number, value: number) => number
  ) => {
    if (_.isNil(resourceEffect)) return;
    _.forEach(resourceEffect, (value, resource) => {
      updatePack(resource as Resource, (prev) => updater(prev, value ?? 0));
    });
  };

  return { pack, updatePack, applyResourceEffects };
};
