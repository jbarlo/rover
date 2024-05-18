import { z } from "zod";
import {
  GraphConfInput,
  State,
  initGraph,
  makeGraphInputSchemaFromInputLiterals,
} from "./graph.js";

export interface InputConfigure<
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
> {
  graph: GraphConfInput<StateId, S, EdgeName, Resource>;
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
export const verifyIsConfig = <
  StateId extends string,
  S extends State<StateId>,
  EdgeName extends string,
  Resource extends string
>(
  candidate: unknown
) => {
  try {
    const schema = makeConfigureSchema(candidate as any);
    return schema.parse(candidate);
  } catch {
    throw new Error("Not a valid configuration");
  }
};

export const configure = <
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
> = ReturnType<typeof configure<StateId, S, EdgeName, Resource>>;
