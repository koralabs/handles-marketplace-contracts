import { Command } from "commander";
import { Decimal } from "decimal.js";
import Enquirer from "enquirer";
import { Err, Ok, Result } from "ts-res";

const adaToLovelace = (ada: number): bigint =>
  BigInt(new Decimal(ada).mul(Math.pow(10, 6)).floor().toString());

const requestSeed = async (): Promise<Result<string, string>> => {
  try {
    const enquirer = new Enquirer();
    const response = await enquirer.prompt({
      type: "password",
      name: "seed",
      message: "Enter seed phrase for funding wallet:\n",
    });

    if (
      !(
        response &&
        "seed" in response &&
        typeof response.seed == "string" &&
        response.seed.trim()
      )
    ) {
      return Err("Input seed correctly.");
    }

    return Ok(response.seed.trim());
  } catch {
    return Err("Input seed correctly");
  }
};

const getSeed = async (program: Command, seed?: string): Promise<string> => {
  if (seed) return seed;
  const seedResult = await requestSeed();
  if (!seedResult.ok) program.error(seedResult.error);

  return seedResult.data;
};

export { adaToLovelace, getSeed };
