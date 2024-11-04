import convertError from "./convert";

import * as helios from "@koralabs/helios";
import { Err, Ok, Result } from "ts-res";

type Callback = () => Promise<helios.Tx>;
type ErrType = string | Error | void | undefined;
type HandleableResult<E extends ErrType> = {
  handle: (handler: (e: E) => void) => HandleableResult<E>;
  complete: () => Promise<Result<helios.Tx, E>>;
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
  callback: Callback,
  unoptimzedScriptCbor?: string
): HandleableResult<string> => {
  const createHandleable = (
    handler: (e: string) => void
  ): HandleableResult<string> => {
    return {
      handle: (handler) => createHandleable(handler),
      complete: async (): Promise<Result<helios.Tx, string>> => {
        try {
          return Ok(await callback());
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
              const errorMessage = res.toString();
              handler(errorMessage);
              return Err(errorMessage);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (runProgramError: any) {
              const errorMessage = `Error running program: ${runProgramError.message} with error ${error.message}`;
              handler(errorMessage);
              return Err(errorMessage);
            }
          }

          const errorMessage = convertError(error);
          handler(errorMessage);
          return Err(errorMessage);
        }
      },
    };
  };

  return createHandleable(() => {});
};

export { mayFailTransaction };
