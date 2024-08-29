import * as helios from "@koralabs/helios";

const Buy = (payoutOutputsOffset: number): helios.UplcData => {
  return new helios.ConstrData(0, [
    new helios.IntData(BigInt(payoutOutputsOffset)),
  ]);
};

const WithdrawOrUpdate = (): helios.UplcData => {
  return new helios.ConstrData(1, []);
};

export { Buy, WithdrawOrUpdate };
