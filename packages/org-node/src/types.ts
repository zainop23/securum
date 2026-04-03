export type LocalResult =
  | { type: 'scalar'; value: number }
  | { type: 'avg'; sum: number; count: number }
  | { type: 'grouped'; groups: Array<{ groupKey: string; value: number }> }
  | { type: 'grouped_avg'; groups: Array<{ groupKey: string; sum: number; count: number }> };
