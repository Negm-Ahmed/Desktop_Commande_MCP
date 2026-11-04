import path from 'path';

/**
 * Matches a PowerShell 7 module folder: "...\PowerShell\Modules" or "...\PowerShell\7\Modules".
 * Windows PowerShell 5.1 folders ("...\WindowsPowerShell\Modules", "...\WindowsPowerShell\v1.0\Modules")
 * do not match, and neither do custom module folders.
 */
const PS7_MODULE_DIR = /(^|[\\/])powershell[\\/](\d+(\.\d+)*[\\/])?modules[\\/]?$/i;

function shellName(shell: string | boolean | undefined): string {
    if (typeof shell !== 'string' || shell.trim() === '') {
        return '';
    }
    return path.win32.basename(shell.trim()).toLowerCase();
}

/**
 * Build the environment for a spawned shell.
 *
 * On Windows, a Desktop Commander started from a PowerShell 7 session (or from a tool that bundles
 * PowerShell 7) inherits a PSModulePath that lists PowerShell 7 module folders first. Windows
 * PowerShell 5.1 then autoloads the PowerShell 7 copy of Microsoft.PowerShell.Utility, which it
 * cannot use, and built-in cmdlets such as Get-FileHash fail with "not recognized".
 * For every shell except pwsh, those PowerShell 7 entries are removed; all other entries keep
 * their order. pwsh rebuilds its own module path at startup, so it is left untouched.
 */
export function buildShellEnv(
    baseEnv: NodeJS.ProcessEnv,
    shell: string | boolean | undefined,
    platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...baseEnv, TERM: 'xterm-256color' };
    if (platform !== 'win32') {
        return env;
    }
    const name = shellName(shell);
    if (name === 'pwsh' || name === 'pwsh.exe') {
        return env;
    }
    const key = Object.keys(env).find(k => k.toLowerCase() === 'psmodulepath');
    if (!key || typeof env[key] !== 'string') {
        return env;
    }
    const kept = (env[key] as string)
        .split(';')
        .filter(entry => entry.trim() !== '' && !PS7_MODULE_DIR.test(entry.trim()));
    if (kept.length === 0) {
        delete env[key];
    } else {
        env[key] = kept.join(';');
    }
    return env;
}
