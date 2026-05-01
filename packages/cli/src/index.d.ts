export const EXIT_CODES: Readonly<{
  OK: 0;
  POLICY_FAILED: 1;
  USAGE: 2;
  PATH: 3;
  DATABASE: 4;
  OUTPUT: 5;
  PARSER: 6;
  INTERNAL: 10;
}>;

export function run(argv?: string[], io?: typeof process): Promise<number>;
