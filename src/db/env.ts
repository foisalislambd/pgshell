import chalk from 'chalk';

export function printEnvHint(): void {
  console.log(chalk.yellow(`💡 Hint: No database credentials found in the current directory's .env file.`));
  console.log(chalk.dim(`For automatic connection next time, create a .env file and add:\n`));
  
  console.log(chalk.cyan(`  DB_HOST=localhost`));
  console.log(chalk.cyan(`  DB_PORT=5432`));
  console.log(chalk.cyan(`  DB_USER=postgres`));
  console.log(chalk.cyan(`  DB_PASSWORD=yourpassword`));
  console.log(chalk.cyan(`  DB_NAME=yourdatabase\n`));

  console.log(chalk.dim(`  --- OR use a single URL ---\n`));
  console.log(chalk.cyan(`  DATABASE_URL="postgresql://user:password@localhost:5432/dbname"\n`));
}
