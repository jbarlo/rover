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

  const outputs = getOutputData();
  const diffs = getDiffs(outputs);
  const diff = diffs[flow];

  if (isNil(diff.diffs)) throw redirect("/");

  return { alias: flow, diff };
}

export default function Index() {
  const { alias, diff } = useLoaderData<typeof loader>();
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <div>{alias}</div>
      <Link to=".." relative="path" prefetch="render">
        Back to Flow
      </Link>
      <div>
        <h2>Diffs</h2>
        {map(diff?.diffs, (o) => (
          <div>
            <div>Pixel difference: {o.numDifferentPixels}</div>
            <img
              src={`data:image/png;base64, ${o.diffImg}`}
              style={{ maxWidth: "100%" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
