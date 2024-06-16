import { Pack } from "../graph.js";
import { z } from "zod";
import { schemaForType } from "./utils.js";
import { Step } from "../scheduler.js";

const packSchema = schemaForType<Pack<string>>()(
  z.record(z.string(), z.number())
);

const stepSchema = schemaForType<Step<string>>()(
  z.object({
    edgeName: z.string(),
    type: z.literal("prep").or(z.literal("action")).or(z.literal("cleanup")),
  })
);

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
    stateId: z.string(),
    pack: packSchema,
  });

export type SampleMetadata<
  StateId extends string,
  Resource extends string
> = z.infer<ReturnType<typeof makeSampleMetadataSchema<StateId, Resource>>>;

export const makeReportSchema = <
  const StateId extends string,
  const Resource extends string
>() =>
  z.object({
    version: z.literal("0.1"),
    samples: z.array(makeSampleMetadataSchema<StateId, Resource>()),
    steps: z.array(stepSchema),
    // TODO add graph
  });

export type Report<StateId extends string, Resource extends string> = z.infer<
  ReturnType<typeof makeReportSchema<StateId, Resource>>
>;
