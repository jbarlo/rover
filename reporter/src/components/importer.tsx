import { FC, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export interface ImporterProps {
  onImport: (files: FileList) => void;
}

const Importer: FC<ImporterProps> = ({ onImport }: ImporterProps) => {
  const [files, setFiles] = useState<FileList | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <Input
          type="file"
          multiple
          className="cursor-pointer"
          ref={inputRef}
          onChange={(e) => {
            setFiles(e.target.files);
          }}
        />
      </div>
      <div>
        <Button
          variant="default"
          disabled={!files?.length}
          onClick={() => {
            if (files) {
              onImport?.(files);
            }
            if (inputRef.current) inputRef.current.value = "";
            setFiles(null);
          }}
        >
          Import
        </Button>
      </div>
    </div>
  );
};

export default Importer;
