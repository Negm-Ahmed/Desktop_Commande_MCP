/**
 * PSModulePath for what the AI runs on Windows (dist/utils/shell.js).
 *
 * When Desktop Commander is started from a PowerShell 7 session, or by a tool
 * that bundles PowerShell 7, the inherited PSModulePath lists PowerShell 7
 * module folders first. Windows PowerShell 5.1 (powershell.exe, the default
 * shell) then loads PowerShell 7's Microsoft.PowerShell.Utility, can't use it,
 * and built-in cmdlets such as Get-FileHash report "not recognized".
 *
 * - withoutPowerShell7ModulePaths(): drops ...\PowerShell\Modules and
 *   ...\PowerShell\<version>\Modules; keeps Windows PowerShell and custom
 *   folders in their order; undefined when nothing is left (any platform)
 * - getCommandEnvironment() on Windows: applies it; the server's own
 *   environment is not changed; with nothing left the variable is removed so
 *   Windows PowerShell builds its default
 */
import assert from 'assert';
import { getCommandEnvironment, withoutPowerShell7ModulePaths } from '../dist/utils/shell.js';
import { runIfMain } from './helpers/run-if-main.js';

const PS7 = {
  userDocs: 'D:\\OneDrive\\Documents\\PowerShell\\Modules',
  shared: 'C:\\Program Files\\PowerShell\\Modules',
  bundled: 'c:\\users\\user\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\Modules',
  home: 'C:\\Program Files\\PowerShell\\7\\Modules',
  homePreview: 'C:\\Program Files\\PowerShell\\7.5.1\\Modules\\',
};
const WINPS = {
  userDocs: 'D:\\OneDrive\\Documents\\WindowsPowerShell\\Modules',
  shared: 'C:\\Program Files\\WindowsPowerShell\\Modules',
  system: 'C:\\WINDOWS\\system32\\WindowsPowerShell\\v1.0\\Modules',
};
const CUSTOM = 'E:\\Tools\\PowerShellModules';
const POLLUTED = [PS7.userDocs, PS7.shared, PS7.bundled, WINPS.userDocs, CUSTOM, PS7.home, WINPS.shared, WINPS.system].join(';');
const CLEAN = [WINPS.userDocs, CUSTOM, WINPS.shared, WINPS.system].join(';');

/** Runs fn with these variables in process.env (undefined: unset), then puts the old values back */
function withEnv(values, fn) {
  const saved = Object.fromEntries(Object.keys(values).map((name) => [name, process.env[name]]));
  const apply = (entries) => {
    for (const [name, value] of Object.entries(entries)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  try {
    apply(values);
    return fn();
  } finally {
    apply(saved);
  }
}

/** The returned environment's keys for a variable, whatever their spelling (Windows names ignore case) */
function keysOf(env, name) {
  return Object.keys(env).filter((k) => k.toUpperCase() === name.toUpperCase());
}

export default async function runTests() {
  const cases = [
    ['PowerShell 7 folders dropped; Windows PowerShell and custom folders kept in order', POLLUTED, CLEAN],
    ['versioned and trailing-backslash PowerShell 7 homes dropped', `${PS7.homePreview};${WINPS.system}`, WINPS.system],
    ['a clean value is unchanged', CLEAN, CLEAN],
    ['empty entries dropped', `;${WINPS.system};;`, WINPS.system],
    ['only PowerShell 7 folders: nothing left', Object.values(PS7).join(';'), undefined],
    ['a folder merely named like PowerShell is kept', 'E:\\PowerShell\\Scripts;E:\\MyPowerShell\\Modules', 'E:\\PowerShell\\Scripts;E:\\MyPowerShell\\Modules'],
  ];
  for (const [name, input, expected] of cases) {
    assert.strictEqual(withoutPowerShell7ModulePaths(input), expected, name);
    console.log(`✓ ${name}`);
  }

  if (process.platform !== 'win32') {
    const env = withEnv({ PSModulePath: POLLUTED }, () => getCommandEnvironment());
    assert.strictEqual(env.PSModulePath, POLLUTED, 'outside Windows, PSModulePath should be passed through unchanged');
    console.log('✓ outside Windows: PSModulePath unchanged');
    return true;
  }

  const env = withEnv({ PSModulePath: POLLUTED }, () => {
    const result = getCommandEnvironment();
    assert.strictEqual(process.env.PSModulePath, POLLUTED, 'the server\'s own environment should not change');
    return result;
  });
  const keys = keysOf(env, 'PSModulePath');
  assert.strictEqual(keys.length, 1, 'exactly one PSModulePath variable');
  assert.strictEqual(env[keys[0]], CLEAN, 'Windows: PowerShell 7 folders removed from PSModulePath');
  console.log('✓ Windows: PowerShell 7 folders removed for commands');

  const emptied = withEnv({ PSModulePath: Object.values(PS7).join(';') }, () => getCommandEnvironment());
  assert.strictEqual(keysOf(emptied, 'PSModulePath').length, 0, 'Windows: with nothing left, PSModulePath is removed');
  console.log('✓ Windows: only PowerShell 7 folders -> PSModulePath removed (Windows PowerShell builds its default)');
  return true;
}

runIfMain(import.meta.url, runTests);
