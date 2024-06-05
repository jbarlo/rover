import { ThemeProvider } from "@/components/themeProvider";
import Importer from "./components/importer";
import FileList from "./components/fileList";
import { useState } from "react";
import { map, slice } from "lodash";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./components/ui/resizable";

function App() {
  const [files, setFiles] = useState<File[]>([]);

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
            }))}
            onClick={() => {}}
            onClickRemove={(f) => {
              setFiles((prev) => [
                ...slice(prev, 0, f.index),
                ...slice(prev, f.index + 1),
              ]);
            }}
          />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel className="p-2">TODO</ResizablePanel>
      </ResizablePanelGroup>
    </ThemeProvider>
  );
}

export default App;
