import type { V2_MetaFunction } from "@remix-run/node";
import { map } from "lodash";
import { useLoaderData } from "@remix-run/react";
import { getOutputData } from "~/utils/readData.server";

export const meta: V2_MetaFunction = () => {
  return [{ title: "Snips" }];
};

export async function loader() {
  const outputs = getOutputData();
  return outputs;
}

export default function Index() {
  const allOutputs = useLoaderData<typeof loader>();
  console.log(allOutputs);
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      {map(allOutputs, (output) => {
        return (
          <div key={output.timestamp}>
            <div>{output.timestamp}</div>
            {map(output.snips, (snip) => (
              <img
                src={`data:image/png;base64, ${snip.snip}`}
                style={{ maxWidth: "100%" }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
