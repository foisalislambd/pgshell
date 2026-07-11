/**
 * Print shell completion scripts for common shells.
 * Usage: eval "$(pgshell completion bash)"
 */
export function printCompletionScript(shell: string): void {
  const commands =
    'ui view query list create drop table delete exec doctor config completion';

  const normalized = shell.toLowerCase().trim();

  if (normalized === 'bash') {
    console.log(`# pgshell bash completion
_pgshell_completions() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local opts="${commands} --json --csv --quiet -q --help --version"
  COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
}
complete -F _pgshell_completions pgshell
`);
    return;
  }

  if (normalized === 'zsh') {
    console.log(`# pgshell zsh completion
#compdef pgshell
_pgshell() {
  local -a cmds
  cmds=(${commands.split(' ').map((c) => `'${c}'`).join(' ')})
  _arguments '1:command:($cmds)' '*--json' '*--csv' '*--quiet' '*-q' '*--help' '*--version'
}
compdef _pgshell pgshell
`);
    return;
  }

  if (normalized === 'powershell' || normalized === 'pwsh') {
    console.log(`# pgshell PowerShell completion
Register-ArgumentCompleter -CommandName pgshell -ScriptBlock {
  param($wordToComplete)
  @(${commands
    .split(' ')
    .map((c) => `'${c}'`)
    .join(', ')}, '--json', '--csv', '--quiet', '-q') |
    Where-Object { $_ -like "$wordToComplete*" } |
    ForEach-Object { [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }
}
`);
    return;
  }

  console.error(`Unsupported shell: ${shell}. Use bash, zsh, or powershell.`);
  process.exit(1);
}
