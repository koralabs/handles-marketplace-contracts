import { packageJson } from "./helpers";

import { Command } from "commander";

const program = new Command();

program
  .name("marketplace")
  .version(packageJson.version)
  .description(packageJson.description);

export default program;
