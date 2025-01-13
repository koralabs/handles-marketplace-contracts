import { makeConstrData, makeIntData, UplcData } from "@helios-lang/uplc";

const Buy = (payoutOutputsOffset: number): UplcData => {
  return makeConstrData(0, [makeIntData(BigInt(payoutOutputsOffset))]);
};

const WithdrawOrUpdate = (): UplcData => {
  return makeConstrData(1, []);
};

export { Buy, WithdrawOrUpdate };
