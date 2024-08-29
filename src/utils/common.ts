import Decimal from "decimal.js";

const adaToLovelace = (ada: number): bigint =>
  BigInt(new Decimal(ada).mul(Math.pow(10, 6)).floor().toString());

export { adaToLovelace };
