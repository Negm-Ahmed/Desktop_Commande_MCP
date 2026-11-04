/**
 * Tests for buildShellEnv (src/utils/shell-env.ts).
 *
 * Regression: when Desktop Commander is started from a PowerShell 7 (or a bundled
 * PowerShell 7 runtime) environment, the inherited PSModulePath lists PowerShell 7
 * module folders first. Windows PowerShell 5.1 then autoloads the PowerShell 7 copy of
 * Microsoft.PowerShell.Utility, fails, and built-in cmdlets such as Get-FileHash
 * report "not recognized".
 */

import assert from 'assert';
import { buildShellEnv } from '../dist/utils/shell-env.js';

const PS7_ENTRIES = [
  'D:\\OneDrive\\Documents\\PowerShell\\Modules',
  'C:\\Program Files\\PowerShell\\Modules',
  'c:\\users\\user\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\native\\powershell\\Modules',
  'C:\\Program Files\\PowerShell\\7\\Modules',
];
const WIN_PS_ENTRIES = [
  'D:\\OneDrive\\Documents\\WindowsPowerShell\\Modules',
  'C:\\Program Files\\WindowsPowerShell\\Modules',
  'C:\\WINDOWS\\system32\\WindowsPowerShell\\v1.0\\Modules',
];
const CUSTOM = 'E:\\Tools\\MyModules';
const polluted = [PS7_ENTRIES[0], PS7_ENTRIES[1], PS7_ENTRIES[2], WIN_PS_ENTRIES[0], CUSTOM, PS7_ENTRIES[3], WIN_PS_ENTRIES[1], WIN_PS_ENTRIES[2]].join(';');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('Windows PowerShell 5.1: PowerShell 7 module folders are removed, others kept in order', () => {
  const env = buildShellEnv({ PSModulePath: polluted, PATH: 'x' }, 'powershell.exe', 'win32');
  assert.strictEqual(env.PSModulePath, [WIN_PS_ENTRIES[0], CUSTOM, WIN_PS_ENTRIES[1], WIN_PS_ENTRIES[2]].join(';'));
  assert.strictEqual(env.PATH, 'x');
});

test('full path to Windows PowerShell is treated the same way', () => {
  const env = buildShellEnv({ PSModulePath: polluted }, 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'win32');
  assert.ok(!env.PSModulePath.toLowerCase().includes('\\powershell\\modules'));
});

test('cmd / default shell on Windows is sanitised too (it may launch powershell.exe)', () => {
  for (const shell of ['cmd.exe', true, undefined]) {
    const env = buildShellEnv({ PSModulePath: polluted }, shell, 'win32');
    assert.strictEqual(env.PSModulePath, [WIN_PS_ENTRIES[0], CUSTOM, WIN_PS_ENTRIES[1], WIN_PS_ENTRIES[2]].join(';'));
  }
});

test('PowerShell 7 (pwsh) keeps the inherited value untouched', () => {
  for (const shell of ['pwsh', 'pwsh.exe', 'C:\\Program Files\\PowerShell\\7\\pwsh.exe']) {
    const env = buildShellEnv({ PSModulePath: polluted }, shell, 'win32');
    assert.strictEqual(env.PSModulePath, polluted);
  }
});

test('variable name is matched case-insensitively and duplicates are not created', () => {
  const env = buildShellEnv({ PSMODULEPATH: polluted }, 'powershell.exe', 'win32');
  const keys = Object.keys(env).filter(k => k.toLowerCase() === 'psmodulepath');
  assert.deepStrictEqual(keys, ['PSMODULEPATH']);
  assert.ok(!env.PSMODULEPATH.toLowerCase().includes('codex-runtimes'));
});

test('a value made only of PowerShell 7 folders is removed so Windows PowerShell uses its default', () => {
  const env = buildShellEnv({ PSModulePath: PS7_ENTRIES.join(';') }, 'powershell.exe', 'win32');
  assert.ok(!('PSModulePath' in env));
});

test('non-Windows platforms are unchanged', () => {
  const env = buildShellEnv({ PSModulePath: polluted }, '/bin/bash', 'linux');
  assert.strictEqual(env.PSModulePath, polluted);
});

test('TERM is set and the input object is not mutated', () => {
  const base = { PSModulePath: polluted };
  const env = buildShellEnv(base, 'powershell.exe', 'win32');
  assert.strictEqual(env.TERM, 'xterm-256color');
  assert.strictEqual(base.PSModulePath, polluted);
  assert.ok(!('TERM' in base));
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log(`✓ ${t.name}`); }
  catch (e) { failed++; console.error(`✗ ${t.name}\n  ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exit(1);
