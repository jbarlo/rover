"use client";

import { FC, Suspense, use } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { makeReportSchema } from "../../../graph/src/schemas/sampleCollector";
export interface ReportViewerProps {
  file: File;
}

const reportSchema = makeReportSchema();
const ReportViewer: FC<ReportViewerProps> = ({ file }: ReportViewerProps) => {
  const fileText = use(file.text());
  const jsonParsedText = JSON.parse(fileText);
  const data = reportSchema.safeParse(jsonParsedText);
  if (data.success === false) {
    return <div>{data.error.message}</div>;
  }

  return <div>{file.name}</div>;
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
        <ReportViewer {...props} />;
      </Suspense>
    </ErrorBoundary>
  );
};

export default SuspendedReportViewer;
