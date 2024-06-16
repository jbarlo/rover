import { writeFileSync } from "fs";
import { AllEdgeName, Pack } from "./graph.js";
import { Report, Sample, SampleMetadata } from "./schemas/sampleCollector.js";
import { Step } from "./scheduler.js";

interface SampleCollectorResponse<
  StateId extends string,
  EdgeName extends string,
  Resource extends string
> {
  addSample: (sample: Sample, stateId: StateId, pack: Pack<Resource>) => void;
  getSamples: () => Map<
    [StateId, Pack<Resource>],
    SampleMetadata<StateId, Resource>
  >;
  storeSamples: (steps: Step<AllEdgeName<EdgeName, StateId>>[]) => void;
}

const sampleCollector = <
  const StateId extends string,
  const EdgeName extends string,
  const Resource extends string
>(
  savePath: string
): SampleCollectorResponse<StateId, EdgeName, Resource> => {
  const samples = new Map<
    [StateId, Pack<Resource>],
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
    storeSamples: (steps: Step<AllEdgeName<EdgeName, StateId>>[]) => {
      const report: Report<StateId, Resource> = {
        version: "0.1",
        samples: [...samples.values()],
        steps,
      };
      writeFileSync(savePath, JSON.stringify(report), "utf8");
    },
  };
};

export default sampleCollector;
