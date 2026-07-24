import { createInterface, type Interface } from "readline";
import { bold, cyan, dim } from "./ansi";

/** Minimal readline-based prompt helpers for the onboarding wizard. */
export class Prompter {
  private rl: Interface;

  constructor() {
    this.rl = createInterface({ input: process.stdin, output: process.stdout });
  }

  async ask(message: string, defaultValue = ""): Promise<string> {
    const suffix = defaultValue ? dim(` [${defaultValue}]`) : "";
    const answer = await new Promise<string>((resolve) => {
      this.rl.question(`${cyan("?")} ${message}${suffix}: `, resolve);
    });
    return answer.trim() || defaultValue;
  }

  async confirm(message: string, defaultYes = true): Promise<boolean> {
    const suffix = defaultYes ? "[Y/n]" : "[y/N]";
    const answer = (await this.ask(`${message} ${dim(suffix)}`)).toLowerCase();
    if (!answer) return defaultYes;
    return answer === "y" || answer === "yes";
  }

  close(): void {
    this.rl.close();
  }
}
