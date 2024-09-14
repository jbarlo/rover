import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Cross1Icon } from "@radix-ui/react-icons";
import { map } from "lodash";
import { Button } from "./ui/button";

export interface FileListProps<
  FileData extends { id: string; name: string; selected: boolean }
> {
  files: FileData[];
  onClick?: (file: FileData) => void;
  onClickRemove?: (file: FileData) => void;
}

const FileList = <
  FileData extends { id: string; name: string; selected: boolean }
>({
  files,
  onClick,
  onClickRemove,
}: FileListProps<FileData>) => {
  return (
    <Table>
      <TableHeader>
        <TableHead>Reports</TableHead>
      </TableHeader>
      <TableBody>
        {map(files, (file) => (
          <TableRow
            key={file.id}
            onClick={() => onClick?.(file)}
            className="cursor-pointer"
            data-state={file.selected ? "selected" : undefined}
          >
            <TableCell>{file.name}</TableCell>
            <TableCell>
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onClickRemove?.(file);
                }}
              >
                <Cross1Icon className="mr-2" />
                Remove
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default FileList;
