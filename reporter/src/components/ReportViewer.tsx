import { FC } from "react";

export interface ReportViewerProps {
  file: File;
}

const ReportViewer: FC<ReportViewerProps> = ({ file }: ReportViewerProps) => (
  <div>{file.name}</div>
);

export default ReportViewer;
