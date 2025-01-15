const bigIntMin = (...args: bigint[]): bigint => {
  return args.reduce((min, e) => {
    return e < min ? e : min;
  }, args[0]);
};

const bigIntMax = (...args: bigint[]): bigint => {
  return args.reduce((max, e) => {
    return e > max ? e : max;
  }, args[0]);
};

const sleep = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(() => resolve(true), milliseconds));
};

export { bigIntMax, bigIntMin, sleep };
