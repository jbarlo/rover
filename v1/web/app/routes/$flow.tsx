import {
  redirect,
  type LoaderArgs,
  type V2_MetaFunction,
} from "@remix-run/node";
import { isNil, map } from "lodash";
import { Link, useLoaderData } from "@remix-run/react";
import { getDiffs, getOutputData } from "~/utils/readData.server";

export const meta: V2_MetaFunction = () => {
  return [{ title: "Snips" }];
};

export async function loader({ params }: LoaderArgs) {
  const { flow } = params;
  if (isNil(flow)) throw redirect("/");

  const flows = getOutputData();
  const diffs = getDiffs(flows);
  const diff = diffs[flow];

  const mostRecentFlow = diff.snipFlows[0];
  if (isNil(mostRecentFlow)) throw redirect("/");

  return { alias: flow, diff, mostRecentFlow };
}

export default function Index() {
  const { alias, diff, mostRecentFlow } = useLoaderData<typeof loader>();
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <div>{alias}</div>
      <div>
        <Link to=".." relative="path" prefetch="render">
          Back to List
        </Link>
      </div>
      {!isNil(diff.diffs) && (
        <div>
          <Link to="diff" prefetch="render">
            See Most Recent Diff
          </Link>
        </div>
      )}
      <div>
        <h2>Snips</h2>
        {map(mostRecentFlow.snips, (o) => (
          <div>
            <div>{o.index < 0 ? "Start" : `Step ${o.index + 1}`}</div>
            <img
              src={`data:image/png;base64, ${o.snip}`}
              style={{ maxWidth: "100%" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
