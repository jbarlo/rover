import fs from "fs";
import { filter, isString, isNil, map } from "lodash";
import { type StepConfig } from "./types";

export const getPathContents = (
  rootDir: string,
  pathPredicate: (path: string) => boolean,
) => {
  const paths = fs.readdirSync(rootDir, { recursive: true });
  // return only valid paths
  const validPaths = filter<(typeof paths)[number], string>(
    paths,
    (path): path is string => isString(path) && pathPredicate(path),
  );

  const jsonList = map(validPaths, (path) => ({
    path,
    content: fs.readFileSync(`${rootDir}/${path}`),
  }));
  return jsonList;
};

export const getStepConfigs = (rootDir: string) => {
  const pathContents = getPathContents(
    rootDir,
    (path) => !isNil(path.match(/\.snapflow\.json$/)),
  );

  const configList = map(pathContents, ({ path, content }) => ({
    filename: path.match(/(\w+)\.snapflow\.json$/)?.[1] ?? "",
    config: JSON.parse(content.toString()) as StepConfig,
  }));
  return configList;
};
