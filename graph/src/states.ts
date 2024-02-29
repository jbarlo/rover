interface State<ID extends string> {
  id: ID;
  navigable?: boolean;
}

export const createStates = <ID extends string>(states: State<ID>[]) => {
  return states;
};

type ParseIdFromStates<T extends State<string>[]> = T[number] extends State<
  infer ID
>
  ? ID
  : never;

interface BaseEdge<ID extends string> {
  from: ID;
  to: ID;
  name: string;
  action: () => void;
  cleanup?: () => void;
  virtual?: boolean;
}

export type Edges<States extends State<string>[]> = BaseEdge<
  ParseIdFromStates<States>
>[];
