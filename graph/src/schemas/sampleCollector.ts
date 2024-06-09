import { CompletePack, makePackSchema, zodStringGeneric } from "../graph.js";
import { z } from "zod";

const sampleSchema = z.object({
  screenshot: z.string().optional(),
  domString: z.string().optional(),
});

export type Sample = z.infer<typeof sampleSchema>;

const makeSampleMetadataSchema = <
  StateId extends string,
  Resource extends string
>() =>
  z.object({
    sample: sampleSchema,
    stateId: zodStringGeneric<StateId>(),
    pack: makePackSchema<Resource>(),
  });

export type SampleMetadata<
  StateId extends string,
  Resource extends string
> = z.infer<ReturnType<typeof makeSampleMetadataSchema<StateId, Resource>>>;

export const makeReportSchema = <
  StateId extends string,
  Resource extends string
>() =>
  z.object({
    version: z.literal("0.1"),
    samples: z.array(makeSampleMetadataSchema<StateId, Resource>()),
    // TODO add graph
  });

export type Report<StateId extends string, Resource extends string> = z.infer<
  ReturnType<typeof makeReportSchema<StateId, Resource>>
>;
