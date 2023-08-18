import fs from "fs";
import { filter, isNil, isString, last, map } from "lodash";
import type { Snip } from "../../../index";

const outputDir = `${__dirname}/../../output`;

export const getOutputData = () => {
  const paths = fs.readdirSync(outputDir, {
    recursive: true,
  });
  const strPaths = filter(paths, isString);

  // return only json paths
  const jsonPaths = filter(strPaths, (path) => !isNil(path.match(/\.json$/)));

  const jsonList = map(jsonPaths, (path) => {
    const splitPath = path.split("/");
    return {
      alias: splitPath[0],
      timestamp: last(splitPath)?.replace(/\.json$/, ""),
      snips: JSON.parse(
        fs.readFileSync(`${outputDir}/${path}`).toString(),
      ) as Snip[],
    };
  });
  return jsonList;
};
