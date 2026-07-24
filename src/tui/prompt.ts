import { createInterface, type Interface } from "readline";
import { bold, cyan, dim } from "./ansi.js";

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

  async select(message: string, options: string[], defaultIndex = 0): Promise<string> {
    process.stdout.write(bold(`${message}\n`));
    options.forEach((opt, i) => {
      const marker = i === defaultIndex ? cyan("›") : " ";
      process.stdout.write(`  ${marker} ${i + 1}) ${opt}\n`);
    });
    const raw = await this.ask("Choose", String(defaultIndex + 1));
    const idx = Number(raw) - 1;
    return options[Number.isInteger(idx) && idx >= 0 && idx < options.length ? idx : defaultIndex];
  }

  close(): void {
    this.rl.close();
  }
}
