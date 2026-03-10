import gradient from 'gradient-string';
import chalk from 'chalk';

const LINES = [
  '   ██████╗  ██████╗ ███████╗██╗  ██╗███████╗██╗     ██╗     ',
  '   ██╔══██╗██╔════╝ ██╔════╝██║  ██║██╔════╝██║     ██║     ',
  '   ██████╔╝██║  ███╗███████╗███████║█████╗  ██║     ██║     ',
  '   ██╔═══╝ ██║   ██║╚════██║██╔══██║██╔══╝  ██║     ██║     ',
  '   ██║     ╚██████╔╝███████║██║  ██║███████╗███████╗ ██║     ',
  '   ╚═╝      ╚═════╝ ╚══════╝╚═╝  ╚═╝╚══════╝╚══════╝ ╚═╝     '
];

const brandGradient = gradient(['#3b82f6', '#8b5cf6', '#ec4899']);

export function printBanner(): void {
  console.log();
  console.log(brandGradient.multiline(LINES.join('\n')));
  console.log(chalk.dim('  ╭───────────────────────────────────────────────────╮'));
  console.log(chalk.dim('  │') + chalk.bold.white('   Interactive PostgreSQL CLI Manager              ') + chalk.dim('│'));
  console.log(chalk.dim('  │') + chalk.gray('   Navigate, query, and manage with ease           ') + chalk.dim('│'));
  console.log(chalk.dim('  ╰───────────────────────────────────────────────────╯'));
  console.log();
}
