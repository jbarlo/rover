import { PNG } from "pngjs";
import dayjs from "dayjs";
import Pixelmatch from "pixelmatch";
import fs from "fs";
import {
  mapValues,
  orderBy,
  filter,
  isNil,
  isString,
  last,
  map,
  groupBy,
} from "lodash";
import type { Snip } from "../../../index";

const outputDir = `${__dirname}/../../output`;

export const getOutputData = () => {
  const paths = fs.readdirSync(outputDir, {
    recursive: true,
  });
  const strPaths = filter(paths, isString);

  // return only json paths
  const jsonPaths = filter(strPaths, (path) => !isNil(path.match(/\.json$/)));

  const flowList = map(jsonPaths, (path) => {
    const splitPath = path.split("/");
    return {
      alias: splitPath[0],
      timestamp: last(splitPath)?.replace(/\.json$/, ""),
      snips: JSON.parse(
        fs.readFileSync(`${outputDir}/${path}`).toString(),
      ) as Snip[],
    };
  });
  return flowList;
};

export const getDiffs = <
  Flow extends {
    alias: string;
    timestamp: string | undefined;
    snips: Snip[];
  },
>(
  flows: Flow[],
) => {
  const groupedFlows = groupBy(flows, "alias");
  const diffs = mapValues(groupedFlows, (output) => {
    const orderedFlows = orderBy(output, (o) => +dayjs(o.timestamp), "desc");
    const [mostRecent, secondMostRecent] = orderedFlows;
    if (
      isNil(mostRecent) ||
      isNil(secondMostRecent) ||
      mostRecent.snips.length !== secondMostRecent.snips.length
    ) {
      return { diffs: null, snipFlows: orderedFlows };
    }

    const diffs = map(mostRecent.snips, (snip, i) => {
      const secondSnip = secondMostRecent.snips[i];

      const snipImg1 = PNG.sync.read(Buffer.from(snip.snip, "base64"));
      const snipImg2 = PNG.sync.read(Buffer.from(secondSnip.snip, "base64"));

      const { width, height } = snipImg1;

      const diff = new PNG({ width, height });
      const numDifferentPixels = Pixelmatch(
        snipImg1.data,
        snipImg2.data,
        diff.data,
        width,
        height,
      );

      return {
        numDifferentPixels,
        diffImg: PNG.sync.write(diff).toString("base64"),
        width,
        height,
      };
    });
    return { diffs, snipFlows: orderedFlows };
  });
  return diffs;
};
