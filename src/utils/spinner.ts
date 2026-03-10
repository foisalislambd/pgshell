import ora, { type Ora } from 'ora';
import chalk from 'chalk';

/**
 * Run async work with an agent-style spinner. Shows loading state, then success/fail.
 */
export async function withSpinner<T>(
  message: string,
  fn: (spinner: Ora) => Promise<T>,
  options?: { successMessage?: string | ((result: T) => string); failMessage?: string | ((err: Error) => string) }
): Promise<T> {
  const spinner = ora({ 
    text: chalk.dim(message), 
    color: 'cyan',
    spinner: 'dots10' // Uses a cooler expanding dots animation
  }).start();

  try {
    const result = await fn(spinner);
    const successText =
      typeof options?.successMessage === 'function'
        ? options.successMessage(result)
        : options?.successMessage ?? message;
    spinner.succeed(chalk.green(successText));
    return result;
  } catch (err) {
    const failText =
      typeof options?.failMessage === 'function'
        ? options.failMessage(err as Error)
        : options?.failMessage ?? (err as Error).message;
    spinner.fail(chalk.red(failText));
    throw err;
  }
}
