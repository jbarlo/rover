import type { V2_MetaFunction } from "@remix-run/node";
import { groupBy, isNil, map, mapValues, orderBy, keys, uniq } from "lodash";
import { Link, useLoaderData } from "@remix-run/react";
import { getOutputData } from "~/utils/readData.server";
import { PNG } from "pngjs";
import dayjs from "dayjs";
import Pixelmatch from "pixelmatch";

export const meta: V2_MetaFunction = () => {
  return [{ title: "Snips" }];
};

export async function loader() {
  const outputs = getOutputData();
  const groupedOutputs = groupBy(outputs, "alias");
  const flowAliases = uniq(keys(groupedOutputs));
  return flowAliases;
}

export default function Index() {
  const flows = useLoaderData<typeof loader>();
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <ul>
        {map(flows, (flow) => (
          <li>
            <Link to={flow} prefetch="intent">
              {flow}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
