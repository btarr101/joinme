export type FirstArg<T> = T extends (arg1: infer A, ...args: any[]) => any ? A : never;
