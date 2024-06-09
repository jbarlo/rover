import { writeFileSync } from "fs";
import { CompletePack } from "./graph.js";
import { Report, Sample, SampleMetadata } from "./schemas/sampleCollector.js";

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
