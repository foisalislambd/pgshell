import Table from 'cli-table3';
import chalk from 'chalk';

export function renderTable(rows: Record<string, unknown>[], headers?: string[]): void {
  if (!rows || rows.length === 0) {
    console.log(chalk.yellow('No results found.'));
    return;
  }
  const keys = headers ?? (() => {
    const keySet = new Set<string>();
    for (const row of rows) {
      for (const k of Object.keys(row)) keySet.add(k);
    }
    return Array.from(keySet);
  })();

  const table = new Table({
    head: keys.map(k => chalk.cyanBright.bold(k)),
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '╭', 'top-right': '╮',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '╰', 'bottom-right': '╯',
      'left': '│', 'left-mid': '├',
      'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤',
      'middle': '│'
    },
    style: {
      head: [], // Keep default colors off so chalk works
      border: ['dim']
    }
  });

  rows.forEach((row) => {
    const values = keys.map((k) => {
      const val = row[k];
      if (val === null || val === undefined) return chalk.dim.italic(val === null ? 'null' : '-');
      if (typeof val === 'object') return chalk.gray(JSON.stringify(val));
      if (typeof val === 'number') return chalk.yellowBright(String(val));
      if (typeof val === 'boolean') return val ? chalk.green('✔') : chalk.red('✖');

      const strVal = String(val);
      if (strVal.length > 50) return strVal.substring(0, 47) + chalk.dim('...');
      return strVal;
    });
    table.push(values);
  });

  console.log(table.toString());
  console.log(chalk.dim(`Total rows: ${rows.length}`));
}
