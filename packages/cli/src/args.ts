import { parseArgs } from "node:util";

/** Flags shared across jc-abp commands. */
export interface CliFlags {
  input?: string;
  output?: string;
  config?: string;
  from?: string;
  dest?: string;
  /** init only: install the admin-pages block too (--no-admin sets false). */
  admin?: boolean;
  /** init only: ABP backend origin; fills .env and the swagger input without the prompt. */
  backend?: string;
}

/** A parsed jc-abp invocation: the command, its positionals, and flags. */
export interface CliInvocation {
  command: "gen" | "add" | "init" | "help";
  positionals: string[];
  flags: CliFlags;
}

/** Which flags each command accepts; `--help`/`-h` is global and stays out of the table. */
const COMMAND_FLAGS: Record<CliInvocation["command"], readonly string[]> = {
  gen: ["input", "output", "config"],
  add: ["from", "dest"],
  init: ["no-admin", "backend"],
  help: [],
};

/** Parse argv into a CliInvocation; unknown commands/flags throw, no command means help. */
export function parseCliArgs(argv: string[]): CliInvocation {
  // node:util's parseArgs has no built-in --no-<flag> negation, so --no-admin is pulled out by
  // hand before the rest of argv goes through the normal boolean/string option parser.
  const noAdmin = argv.includes("--no-admin");
  const rest = argv.filter((arg) => arg !== "--no-admin");
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      input: { type: "string" },
      output: { type: "string" },
      config: { type: "string" },
      from: { type: "string" },
      dest: { type: "string" },
      backend: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...positionalRest] = positionals;
  if (values.help === true || command === undefined || command === "help") {
    return { command: "help", positionals: [], flags: {} };
  }
  if (command !== "gen" && command !== "add" && command !== "init") {
    throw new Error(`unknown command: ${command}`);
  }
  // 解析器认得所有 flag，但每个命令只消费其中一部分。不按命令收口的话 `gen --no-admin`、
  // `add --input x` 都会被静默吞掉，用户以为生效了。
  const accepted = COMMAND_FLAGS[command];
  const given = Object.entries(values)
    .filter(([name, value]) => name !== "help" && value !== undefined)
    .map(([name]) => name);
  if (noAdmin) given.push("no-admin");
  const rejected = given.filter((name) => !accepted.includes(name));
  if (rejected.length > 0) {
    throw new Error(
      `unknown flag for ${command}: ${rejected.map((name) => `--${name}`).join(", ")} ` +
        `(${command} accepts ${accepted.map((name) => `--${name}`).join(", ") || "no flags"})`,
    );
  }
  const flags: CliFlags = {};
  if (values.input !== undefined) flags.input = values.input;
  if (values.output !== undefined) flags.output = values.output;
  if (values.config !== undefined) flags.config = values.config;
  if (values.from !== undefined) flags.from = values.from;
  if (values.dest !== undefined) flags.dest = values.dest;
  if (values.backend !== undefined) flags.backend = values.backend;
  if (command === "init") flags.admin = !noAdmin;
  return { command, positionals: positionalRest, flags };
}
