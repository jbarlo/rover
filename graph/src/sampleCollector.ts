import { AllEdgeName, Pack } from "./graph.js";

interface Sample {
  screenshot: string;
}

interface SampleMetadata<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> {
  sample: Sample;
  edgeName: AllEdgeName<EdgeName, StateId>;
  pack: Pack<Resource>;
}

interface SampleCollectorResponse<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> {
  addSample: (
    sample: Sample,
    edgeName: AllEdgeName<EdgeName, StateId>,
    pack: Pack<Resource>
  ) => void;
  getSamples: () => Map<
    [AllEdgeName<EdgeName, StateId>, Pack<Resource>],
    SampleMetadata<StateId, EdgeName, Resource>
  >;
  storeSamples: () => void;
}

const sampleCollector = <
  StateId extends string,
  EdgeName extends string,
  Resource extends string
>(): SampleCollectorResponse<StateId, EdgeName, Resource> => {
  const samples = new Map<
    [AllEdgeName<EdgeName, StateId>, Pack<Resource>],
    SampleMetadata<StateId, EdgeName, Resource>
  >();
  return {
    addSample: (sample, edgeName, pack) => {
      if (samples.has([edgeName, pack])) {
        throw new Error("Sample already exists");
      }
      console.log(pack);
      samples.set([edgeName, pack], { sample, edgeName, pack });
    },
    getSamples: () => samples,
    // TODO
    storeSamples: () => {
      console.log([...samples.values()]);
    },
  };
};

export default sampleCollector;
