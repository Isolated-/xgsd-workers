import { createHandler } from "@xgsd/workers";
import { join } from "path";

const cwd = process.cwd();
const handler = createHandler({
  cwd,
  config: {
    entry: "worker.ts",
    bundler: {
      enabled: true,
      extensions: [".ts"],
      cache: {
        strategy: "change",
      },
    },
  },
  stream: process.stdout,
});

async function main() {
  const output = await handler();
}
main().catch((err) => console.error(err));
