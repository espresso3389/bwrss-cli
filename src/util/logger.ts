import chalk from "chalk";

export const log = {
  info: (msg: string) => console.log(chalk.blue("info"), msg),
  success: (msg: string) => console.log(chalk.green("ok"), msg),
  warn: (msg: string) => console.log(chalk.yellow("warn"), msg),
  error: (msg: string) => console.error(chalk.red("error"), msg),
  dim: (msg: string) => console.log(chalk.dim(msg)),
};
