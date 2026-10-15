import { buildContract, BuildContractConfig } from "../../src/buildContract.js";
import { loadConfig } from "../../src/config.js";
import program from "../cli.js";
import { configs as parametersConfig } from "../configs/index.js";

const buildCommand = program
  .command("build")
  .description("Build optimized and unoptimized marketplace SC")
  .action(async () => {
    const configResult = loadConfig();
    if (!configResult.ok) return program.error(configResult.error);
    const config = configResult.data;

    const parameters = parametersConfig[config.network];
    if (!parameters)
      return program.error(`Parameters not set for ${config.network}`);

    const deployConfig: BuildContractConfig = {
      parameters,
    };

    buildContract(deployConfig);
  });

export default buildCommand;
