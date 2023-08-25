import { isNil, last, map } from "lodash";
import type { Snip } from "../../../index";
import { getPathContents } from "../../../utils";

const outputDir = `${__dirname}/../../output`;

export const getOutputData = () => {
  const pathContents = getPathContents(
    outputDir,
    (path) => !isNil(path.match(/\.json$/)),
  );

  const jsonList = map(pathContents, ({ path, content }) => {
    const splitPath = path.split("/");
    return {
      alias: splitPath[0],
      timestamp: last(splitPath)?.replace(/\.json$/, ""),
      snips: JSON.parse(content.toString()) as Snip[],
    };
  });
  return jsonList;
};
