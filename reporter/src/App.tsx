import { ThemeProvider } from "@/components/themeProvider";
import Importer from "./components/importer";
import FileList from "./components/fileList";
import { useState } from "react";
import { clamp, map, slice } from "lodash";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./components/ui/resizable";
import ReportViewer from "./components/ReportViewer";

function App() {
  const [files, setFiles] = useState<File[]>([]);

  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);

  const selectedFile = files[selectedFileIndex];

  return (
    <ThemeProvider defaultTheme="dark" storageKey="reporter-ui-theme">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel className="p-2" defaultSize={25}>
          <div>
            <Importer
              onImport={(f) => {
                setFiles((prev) => [...prev, ...f]);
              }}
            />
          </div>
          <FileList
            files={map(files, (f, i) => ({
              id: `${i}-${f.name}`,
              index: i,
              name: f.name,
              selected: i === selectedFileIndex,
            }))}
            onClick={(f) => {
              setSelectedFileIndex(f.index);
            }}
            onClickRemove={(f) => {
              // if the removed file is or before the selected file, shift the
              // index back by one
              if (f.index <= selectedFileIndex) {
                setSelectedFileIndex((prev) =>
                  clamp(prev - 1, 0, files.length - 1)
                );
              }
              setFiles((prev) => [
                ...slice(prev, 0, f.index),
                ...slice(prev, f.index + 1),
              ]);
            }}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="p-2">
          <div className="overflow-auto h-full">
            {selectedFile && <ReportViewer file={selectedFile} />}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </ThemeProvider>
  );
}

export default App;
