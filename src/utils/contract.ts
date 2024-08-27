import { getDirname } from "../helpers";

import * as helios from "@koralabs/helios";
import fs from "fs/promises";
import path from "path";

const dirname = getDirname(import.meta.url);
const contractPath = path.join(dirname, "../contract/marketplace.helios");

const getHeliosProgram = async (): Promise<helios.Program> => {
  const contractFile = (await fs.readFile(contractPath)).toString();
  const program = helios.Program.new(contractFile);
  return program;
};

const getUplcProgram = async (
  optimize: boolean = false
): Promise<helios.UplcProgram> => {
  const program = await getHeliosProgram();

  return program.compile(optimize);
};

export { getHeliosProgram, getUplcProgram };
