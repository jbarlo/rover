import { FC } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { map } from "lodash";

export interface StepListProps {
  steps: { title: string }[];
}

const StepList: FC<StepListProps> = ({ steps }: StepListProps) => (
  <Table>
    <TableHeader>
      <TableHead>Steps</TableHead>
    </TableHeader>
    <TableBody>
      {map(steps, (step, i) => (
        <TableRow key={`${step.title}-${i}`} className="cursor-pointer">
          <TableCell>{`${i + 1}. ${step.title}`}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export default StepList;
