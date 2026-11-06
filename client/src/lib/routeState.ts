/** Reads a true/false flag from router state, which is untyped and may come from an older visit. */
export const routeFlag = (state: unknown, flag: string): boolean =>
  typeof state === 'object' && state !== null && Reflect.get(state, flag) === true;
