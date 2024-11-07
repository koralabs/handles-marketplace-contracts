import { BuildTxError, SuccessResult } from "../../types";

import * as helios from "@koralabs/helios";
import { Err, Ok, Result } from "ts-res";

type Callback = () => Promise<helios.Tx>;
type ErrType = string | Error | BuildTxError | void | undefined;
type HandleableResult<E extends ErrType> = {
  handle: (handler: (e: E) => void) => HandleableResult<E>;
  complete: () => Promise<Result<SuccessResult, E>>;
};

const buildRefScriptUplcProgram = (cbor: string) => {
  const getProgram = (programHex: string) => {
    try {
      // Try encoding the script as a UPLC contract if it works send that back!
      return helios.UplcProgram.fromCbor(helios.hexToBytes(programHex));
    } catch (err) {
      // Otherwise wrap the program in a UplcData bytes block and try again!
      return helios.UplcProgram.fromCbor(
        helios.Cbor.encodeBytes(helios.hexToBytes(programHex))
      );
    }
  };

  const refScript = getProgram(cbor);
  return refScript;
};

const mayFailTransaction = (
  tx: helios.Tx,
  callback: Callback,
  unoptimzedScriptCbor?: string
): HandleableResult<Error | BuildTxError> => {
  const createHandleable = (
    handler: (e: Error) => void
  ): HandleableResult<Error | BuildTxError> => {
    return {
      handle: (handler) => createHandleable(handler),
      complete: async (): Promise<
        Result<SuccessResult, Error | BuildTxError>
      > => {
        try {
          const tx = await callback();
          return Ok({ cbor: tx.toCborHex(), dump: tx.dump() });
        } catch (error: any) {
          if (error.context && unoptimzedScriptCbor) {
            const { context } = error;
            const args = [
              helios.UplcData.fromCbor(context.Redeemer),
              helios.UplcData.fromCbor(context.ScriptContext),
            ];

            if ("Datum" in context) {
              args.unshift(helios.UplcData.fromCbor(context.Datum));
            }

            try {
              const uplcProgram =
                buildRefScriptUplcProgram(unoptimzedScriptCbor);
              const res = await uplcProgram.run(
                args.map(
                  (a) => new helios.UplcDataValue(helios.Site.dummy(), a)
                )
              );
              error.message = res.toString();

              const buildTxError = BuildTxError.fromError(error, tx);
              handler(buildTxError);
              return Err(buildTxError);
            } catch (runProgramError: any) {
              runProgramError.message = `Error running program: ${runProgramError.message} with error ${error.message}`;

              const buildTxError = BuildTxError.fromError(runProgramError, tx);
              handler(buildTxError);
              return Err(buildTxError);
            }
          }

          const buildTxError = BuildTxError.fromError(error, tx);
          handler(buildTxError);
          return Err(buildTxError);
        }
      },
    };
  };

  return createHandleable(() => {});
};

export { mayFailTransaction };
