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

export interface ActionContext<
  EdgeName extends string,
  S extends State<string>,
  Resource extends string
> {
  edge: Edge<AllEdgeName<EdgeName, S["id"]>, S, Resource>;
  graph: Graph<S["id"], S, ExplicitEdgesOnly<EdgeName>, Resource>;
}
export interface Edge<
  EdgeName extends string,
  S extends State<string>,
  Resource extends string
> {
  from: S["id"];
  to: S["id"];
  name: EdgeName;
  // the changes made to resources through the action
  resourceEffects?: Resource extends string
    ? ResourceEffects<Resource>
    : undefined;
  condition?: Resource extends string
    ? Cond<EdgeCondition<Resource>>
    : undefined;
  action: (context: ActionContext<EdgeName, S, Resource>) => Promise<void>;
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

export type ImplicitEdgeName<StateId extends string> =
  `implicit-${StateId}-to-${StateId}`;
export interface ImplicitEdge<
  EdgeName extends string,
  S extends State<string>,
  Resource extends string
> extends Omit<Edge<EdgeName, S, Resource>, "name" | "action"> {
  name: ImplicitEdgeName<S["id"]>;
  action: (
    context: ActionContext<ImplicitEdgeName<S["id"]>, S, Resource>
  ) => Promise<void>;
}

export type AllEdgeName<EdgeName extends string, StateId extends string> =
  | EdgeName
  | ImplicitEdgeName<StateId>;

export type ExplicitEdgesOnly<EdgeName extends string> = Exclude<
  EdgeName,
  ImplicitEdgeName<any>
>;

// TODO nice things for a not a monad -- all clones of the actual underlying
// - keyed edges -- with 1-to-1 guarantees
// - keyed states -- with 1-to-1 guarantees
// - starting states (keyed maybe)
// - all resources

export type GetEdgesResult<
  S extends State<string>,
  EdgeName extends string,
  Resource extends string
> = Record<EdgeName, Edge<EdgeName, S, Resource>>;
export type GetAllEdgesResult<
  S extends State<string>,
  EdgeName extends string,
  Resource extends string
> = GetEdgesResult<S, AllEdgeName<EdgeName, S["id"]>, Resource>;
type GetExplicitEdges<
  S extends State<string>,
  EdgeName extends string,
  Resource extends string
> = () => GetEdgesResult<S, EdgeName, Resource>;
type GetAllEdges<
  S extends State<string>,
  EdgeName extends string,
  Resource extends string
> = () => GetAllEdgesResult<S, EdgeName, Resource>;

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
  edges: Edge<EdgeName, S, Resource>[];
  resources: Resource[];
  implicitEdgeAction?: ImplicitEdge<EdgeName, S, Resource>["action"];
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
  EdgeName extends ExplicitEdgesOnly<string>,
  Resource extends string
> {
  getExplicitEdges: GetExplicitEdges<S, EdgeName, Resource>;
  getImplicitEdges: () => ImplicitEdge<EdgeName, S, Resource>[];
  getAllEdges: GetAllEdges<S, EdgeName, Resource>;
  getStates: () => S[];
  getNavigableStates: () => S[];
  getResources: () => Resource[];
}
// TODO ensure generics are always string literals
// TODO these init functions are ideally zod transforms
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
  schema.parse(conf);

  const getStates = () => _.cloneDeep(states);
  const getNavigableStates = () => getStates().filter((s) => !_.isNil(s.url));

  // TODO implicit edges with effects -- will affect path stitching
  const implicitEdges = _.flatMap(getNavigableStates(), (navState) =>
    _.compact(
      _.map(getStates(), (otherState) => {
        if (navState.id === otherState.id) return null;
        const implicitEdge: ImplicitEdge<EdgeName, S, Resource> = {
          from: otherState.id,
          to: navState.id,
          name: `implicit-${otherState.id}-to-${navState.id}` as const,
          action: conf.implicitEdgeAction ?? (async () => {}),
        };
        return implicitEdge;
      })
    )
  );

  const getImplicitEdges = () => _.cloneDeep(implicitEdges);

  const getExplicitEdges: GetExplicitEdges<S, EdgeName, Resource> = () => {
    const toReturn = _.keyBy(_.cloneDeep(edges), "name") as GetEdgesResult<
      S,
      EdgeName,
      Resource
    >; // TODO typing
    return toReturn;
  };

  const getAllEdges: GetAllEdges<S, EdgeName, Resource> = () => {
    const toReturn = _.keyBy(
      [..._.cloneDeep(edges), ...getImplicitEdges()],
      "name"
    ) as ReturnType<GetAllEdges<S, EdgeName, Resource>>; // TODO typing
    return toReturn;
  };

  return {
    getExplicitEdges,
    getImplicitEdges,
    getAllEdges,
    getStates,
    getNavigableStates,
    getResources: () => _.cloneDeep(resources),
  };
};

export type ValueOf<T> = T[keyof T];

export type Pack<Resource extends string> = Record<Resource, number>;

export const preparePack = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  graph: Graph<StateId, S, EdgeName, Resource>,
  initialPack?: Partial<Pack<Resource>>
) => {
  const emptyPack = _.mapValues(
    _.keyBy(graph.getResources(), (r) => r),
    () => 0
  ) as Pack<Resource>; // TODO typing
  const pack: Pack<Resource> = {
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

  return { getPack: () => _.cloneDeep(pack), updatePack, applyResourceEffects };
};
