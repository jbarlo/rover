import type { V2_MetaFunction } from "@remix-run/node";
import { groupBy, isNil, map, mapValues, orderBy } from "lodash";
import { useLoaderData } from "@remix-run/react";
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
  return mapValues(groupedOutputs, (output) => {
    const orderedOutputs = orderBy(output, (o) => +dayjs(o.timestamp), "desc");
    const [mostRecent, secondMostRecent] = orderedOutputs;
    if (
      isNil(mostRecent) ||
      isNil(secondMostRecent) ||
      mostRecent.snips.length !== secondMostRecent.snips.length
    ) {
      return null;
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
      };
    });
    return { diffs, snipFlows: orderedOutputs };
  });
}

export default function Index() {
  const allOutputs = useLoaderData<typeof loader>();
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      {map(allOutputs, (output, alias) => {
        return (
          <div>
            <h1>{alias}</h1>
            <h2>Diffs</h2>
            {map(output?.diffs, (o) => (
              <div>
                <div>Pixel difference: {o.numDifferentPixels}</div>
                <img
                  src={`data:image/png;base64, ${o.diffImg}`}
                  style={{ maxWidth: "100%" }}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
