interface State<ID extends string> {
  id: ID;
  // the state's canonical url, if it exists
  // TODO find a way to handle *static-er* slugs
  url?: string;
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
  // TODO -- very inefficient to define reusable prep and cleanup since nav and effects
  // should be performable via UI.
  // the graph should be able to determine what resources are needed for each action,
  // then a prep path can be automatically generated before execution
  prep?: () => void;
  action: () => void;
  cleanup?: () => void;
  virtual?: boolean;
}

export type Edges<States extends State<string>[]> = BaseEdge<
  ParseIdFromStates<States>
>[];
