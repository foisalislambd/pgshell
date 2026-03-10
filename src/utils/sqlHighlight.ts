import chalk from 'chalk';

/**
 * Highlight SQL for terminal display - agent-style readable output.
 * No external deps, uses chalk for colors.
 */
export function highlightSql(sqlText: string): string {
  if (!sqlText.trim()) return sqlText;

  return sqlText
    // SQL Keywords
    .replace(
      /\b(SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|JOIN|LEFT|RIGHT|INNER|OUTER|ON|ORDER BY|GROUP BY|LIMIT|OFFSET|AND|OR|AS|IN|NOT|NULL|RETURNING|PRIMARY KEY|FOREIGN KEY|REFERENCES|CASCADE|DEFAULT)\b/gi,
      (m) => chalk.cyanBright.bold(m)
    )
    // SQL Types
    .replace(
      /\b(VARCHAR|TEXT|INTEGER|INT|SERIAL|BIGSERIAL|BOOLEAN|BOOL|TIMESTAMP|DATE|UUID|JSON|JSONB|DECIMAL|NUMERIC)\b/gi,
      (m) => chalk.magentaBright(m)
    )
    // Constants (TRUE/FALSE/NULL)
    .replace(/\b(NULL|TRUE|FALSE)\b/gi, chalk.magenta.bold('$1'))
    // Strings
    .replace(/'([^']*)'/g, chalk.greenBright("'$1'"))
    // Numbers
    .replace(/\b\d+\b/g, chalk.yellowBright('$&'))
    // Comments
    .replace(/--.*$/gm, chalk.dim.italic('$&'));
}
