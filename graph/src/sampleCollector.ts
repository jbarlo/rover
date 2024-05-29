import { writeFileSync } from "fs";
import { Pack } from "./graph.js";

export interface Sample {
  screenshot?: string;
  domString?: string;
}

interface SampleMetadata<StateId extends string, Resource extends string> {
  sample: Sample;
  stateId: StateId;
  pack: Pack<Resource>;
}

interface SampleCollectorResponse<
  StateId extends string,
  Resource extends string
> {
  addSample: (sample: Sample, stateId: StateId, pack: Pack<Resource>) => void;
  getSamples: () => Map<
    [StateId, Pack<Resource>],
    SampleMetadata<StateId, Resource>
  >;
  storeSamples: () => void;
}

const sampleCollector = <StateId extends string, Resource extends string>(
  savePath: string
): SampleCollectorResponse<StateId, Resource> => {
  const samples = new Map<
    [StateId, Pack<Resource>],
    SampleMetadata<StateId, Resource>
  >();
  return {
    addSample: (sample, stateId, pack) => {
      if (samples.has([stateId, pack])) {
        throw new Error("Sample already exists");
      }
      console.log(pack);
      samples.set([stateId, pack], { sample, stateId, pack });
    },
    getSamples: () => samples,
    storeSamples: () => {
      writeFileSync(savePath, JSON.stringify([...samples.values()]), "utf8");
    },
  };
};

export default sampleCollector;
