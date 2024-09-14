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
  // TEMP [hide domstring]
  // domString: z.string().optional(),
});

export type Sample = z.infer<typeof sampleSchema>;

const metadataSchema = z.object({
  sample: sampleSchema,
  stateId: z.string(),
  pack: packSchema,
});

export type SampleMetadata = z.infer<typeof metadataSchema>;

export const reportSchema = z.object({
  version: z.literal("0.1"),
  samples: z.array(metadataSchema),
  steps: z.array(stepSchema),
  // TODO add graph
});

export type Report = z.infer<typeof reportSchema>;
