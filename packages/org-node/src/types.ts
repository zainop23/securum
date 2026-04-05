export type LocalResult =
  | { type: 'scalar'; value: number; isCount?: boolean }
  | { type: 'avg'; sum: number; count: number }
  | { type: 'grouped'; groups: Array<{ groupKey: string; value: number }>; isCount?: boolean }
  | { type: 'grouped_avg'; groups: Array<{ groupKey: string; sum: number; count: number }> };
