import path from "path";
import fs from "fs";

const defaultSnapDir = "./snaps";
const defaultPort = "6733";

export const getConfig = () => {
  const snapflowConfigPath = path.resolve(
    process.env.SNAPFLOW_CONF ?? "./snapflowconfig.json",
  );

  const snapflowConfig = JSON.parse(
    fs.readFileSync(snapflowConfigPath).toString(),
  );

  const snapDir: string =
    process.env.SNAP_DIR ?? snapflowConfig?.snapDir ?? defaultSnapDir;
  const port: string = process.env.PORT ?? snapflowConfig?.port ?? defaultPort;

  return { snapDir, port };
};
