import { writeFileSync } from "fs";
import { CompletePack, makePackSchema, zodStringGeneric } from "./graph.js";
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

type SampleMetadata<StateId extends string, Resource extends string> = z.infer<
  ReturnType<typeof makeSampleMetadataSchema<StateId, Resource>>
>;

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

interface SampleCollectorResponse<
  StateId extends string,
  Resource extends string
> {
  addSample: (
    sample: Sample,
    stateId: StateId,
    pack: CompletePack<Resource>
  ) => void;
  getSamples: () => Map<
    [StateId, CompletePack<Resource>],
    SampleMetadata<StateId, Resource>
  >;
  storeSamples: () => void;
}

const sampleCollector = <StateId extends string, Resource extends string>(
  savePath: string
): SampleCollectorResponse<StateId, Resource> => {
  const samples = new Map<
    [StateId, CompletePack<Resource>],
    SampleMetadata<StateId, Resource>
  >();
  return {
    addSample: (sample, stateId, pack) => {
      if (samples.has([stateId, pack])) {
        console.log("Sample already exists", JSON.stringify([stateId, pack]));
      }
      console.log(pack);
      samples.set([stateId, pack], { sample, stateId, pack });
    },
    getSamples: () => samples,
    storeSamples: () => {
      const report: Report<StateId, Resource> = {
        version: "0.1",
        samples: [...samples.values()],
      };
      writeFileSync(savePath, JSON.stringify(report), "utf8");
    },
  };
};

export default sampleCollector;
