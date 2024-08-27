import Decimal from "decimal.js";

const adaToLovelace = (ada: number): number =>
  new Decimal(ada).mul(Math.pow(10, 6)).floor().toNumber();

export { adaToLovelace };
