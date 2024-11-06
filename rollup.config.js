import pkg from "./package.json" assert { type: "json" };

import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import { builtinModules } from "module";
import copy from "rollup-plugin-copy";
import typescript from "rollup-plugin-typescript2";

const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  ...builtinModules,
];

export default {
  input: "./src/index.ts",
  output: {
    file: "dist/index.cjs", // Specify the output file with directory
    format: "cjs",
    sourcemap: true,
  },
  plugins: [
    resolve(),
    commonjs(),
    json(),
    typescript({
      tsconfig: "tsconfig.json",
    }),
    copy({
      targets: [
        { src: "src/contract/marketplace.helios", dest: "dist/contract" },
        { src: "src/contract/marketplace.helios", dest: "./contract" },
      ],
    }),
  ],
  external,
};
