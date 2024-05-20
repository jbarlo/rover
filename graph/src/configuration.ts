import { z } from "zod";
import {
  AllEdgeName,
  ExplicitEdgesOnly,
  Graph,
  GraphConfInput,
  State,
  initGraph,
  makeGraphInputSchemaFromInputLiterals,
} from "./graph.js";
import { Step } from "./scheduler.js";

export interface InputConfigureContext<
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
> {
  steps: Step<AllEdgeName<EdgeName, S["id"]>>[];
  graph: Graph<S["id"], S, ExplicitEdgesOnly<EdgeName>, Resource>;
}

export interface InputConfigure<
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
> {
  graph: GraphConfInput<StateId, S, EdgeName, Resource>;
  beforeEach?: (
    context: InputConfigureContext<StateId, S, EdgeName, Resource>
  ) => Promise<void>;
  afterEach?: (
    context: InputConfigureContext<StateId, S, EdgeName, Resource>
  ) => Promise<void>;
  beforeAll?: (
    context: InputConfigureContext<StateId, S, EdgeName, Resource>
  ) => Promise<void>;
  afterAll?: (
    context: InputConfigureContext<StateId, S, EdgeName, Resource>
  ) => Promise<void>;
}

const makeConfigureSchema = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  conf: InputConfigure<StateId, S, EdgeName, Resource>
) => {
  const graphSchema = makeGraphInputSchemaFromInputLiterals(conf.graph);
  return z.object({
    graph: graphSchema,
  });
};

// TODO perform in an actually typechecked way
export const verifyIsConfig = (candidate: unknown) => {
  try {
    const schema = makeConfigureSchema(candidate as any);
    schema.parse(candidate);
  } catch (e) {
    console.error(e);
    throw new Error("Not a valid configuration");
  }
};

// Mainly to get intellisense in config file
export const configure = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  conf: InputConfigure<StateId, S, EdgeName, Resource>
) => {
  verifyIsConfig(conf);
  return conf;
};

// TODO these init functions are ideally zod transforms
export const initConfiguration = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  conf: InputConfigure<StateId, S, EdgeName, Resource>
) => {
  verifyIsConfig(conf);
  return { ...conf, graph: initGraph(conf.graph) };
};

export type Configure<
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
> = ReturnType<typeof initConfiguration<StateId, S, EdgeName, Resource>>;
