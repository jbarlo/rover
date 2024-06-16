"use client";

import { FC, Suspense, use } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { isNil, map } from "lodash";
import { reportSchema } from "../../../graph/src/schemas/sampleCollector";

export interface ReportViewerProps {
  file: File;
}

const ReportViewer: FC<ReportViewerProps> = ({ file }: ReportViewerProps) => {
  const fileText = use(file.text());
  const jsonParsedText = JSON.parse(fileText);
  const data = reportSchema.safeParse(jsonParsedText);
  if (data.success === false) {
    return <div>{data.error.message}</div>;
  }

  return (
    <div>
      <div>{file.name}</div>
      <div>
        {map(data.data.samples, (sample) => {
          const image = isNil(sample.sample.screenshot) ? null : (
            <img src={`data:image/png;base64, ${sample.sample.screenshot}`} />
          );
          return (
            <div>
              <div>
                <span>{`State ID: ${sample.stateId} -- Pack: ${JSON.stringify(
                  sample.pack
                )}`}</span>
              </div>
              <div className="pt-2 pb-2">{image}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const fallbackRender = ({ error }: { error: { message: string } }) => {
  return (
    <div role="alert">
      <p>Something went wrong:</p>
      <pre style={{ color: "red" }}>{error.message}</pre>
    </div>
  );
};

const SuspendedReportViewer: FC<ReportViewerProps> = (
  props: ReportViewerProps
) => {
  return (
    <ErrorBoundary fallbackRender={fallbackRender}>
      <Suspense fallback={"loading"}>
        <ReportViewer {...props} />
      </Suspense>
    </ErrorBoundary>
  );
};

export default SuspendedReportViewer;
