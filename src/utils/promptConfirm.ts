import readline from 'readline';

/** Simple y/N confirmation for non-inquirer CLI flows. */
export function promptConfirmation(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^(y|yes)$/i.test(answer.trim()));
    });
  });
}
