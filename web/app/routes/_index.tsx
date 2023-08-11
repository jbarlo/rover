import type { V2_MetaFunction } from "@remix-run/node";
import { map } from "lodash";
import steps from "../../../out.json";

export const meta: V2_MetaFunction = () => {
  return [{ title: "Snips" }];
};

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      {map(steps, (step) => (
        <img
          src={`data:image/png;base64, ${step.snip}`}
          style={{ maxWidth: "100%" }}
        />
      ))}
    </div>
  );
}
