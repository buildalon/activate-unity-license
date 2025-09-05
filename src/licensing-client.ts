import { ResolveGlobPath, GetHubRootPath } from './utility';
import core = require('@actions/core');
import exec = require('@actions/exec');
import path = require('path');
import fs = require('fs');
import os = require('os');
import { LicenseType } from './types';

let client = undefined;

const servicesPath = {
    win32: path.join(process.env.PROGRAMDATA || '', 'Unity', 'config'),
    darwin: path.join('/Library', 'Application Support', 'Unity', 'config'),
    linux: path.join('/usr', 'share', 'unity3d', 'config')
};

async function getLicensingClient(): Promise<string> {
    core.debug('Getting Licensing Client...');
    const unityHubPath = process.env.UNITY_HUB_PATH || process.env.HOME;
    core.debug(`Unity Hub Path: ${unityHubPath}`);
    await fs.promises.access(unityHubPath, fs.constants.R_OK);
    const rootHubPath = await GetHubRootPath(unityHubPath);
    const globs = [rootHubPath, '**'];

    if (process.platform === 'win32') {
        globs.push('Unity.Licensing.Client.exe');
    } else {
        globs.push('Unity.Licensing.Client');
    }

    const licenseClientPath = await ResolveGlobPath(globs);
    core.debug(`Unity Licensing Client Path: ${licenseClientPath}`);
    await fs.promises.access(licenseClientPath, fs.constants.X_OK);
    return licenseClientPath;
}

export async function PatchLicenseVersion() {
    let licenseVersion = core.getInput('license-version');

    if (!licenseVersion) {
        // check if the UNITY_EDITOR_PATH is set. If it is, use it to determine the license version
        const unityEditorPath = process.env['UNITY_EDITOR_PATH'];
        if (unityEditorPath) {
            const versionMatch = unityEditorPath.match(/(\d+)\.(\d+)\.(\d+)/);
            if (!versionMatch) {
                licenseVersion = '6.x'; // default to 6.x if version cannot be determined
            } else {
                switch (versionMatch[1]) {
                    case '4':
                        licenseVersion = '4.x';
                        break;
                    case '5':
                        licenseVersion = '5.x';
                        break;
                    default:
                        licenseVersion = '6.x'; // default to 6.x for any other
                        break;
                }
            }
        }
    }
    if (licenseVersion === '6.x') {
        return;
    }
    if (licenseVersion !== '5.x' && licenseVersion !== '4.x') {
        core.debug(`Specified license version '${licenseVersion}' is unsupported, skipping`);
        return;
    }
    if (!client) {
        client = await getLicensingClient();
    }
    const clientDirectory = path.dirname(client);
    const patchedDirectory = path.join(os.tmpdir(), `UnityLicensingClient-${licenseVersion.replace('.', '_')}`);
    if (await fs.promises.mkdir(patchedDirectory, { recursive: true }) === undefined) {
        core.debug('Unity Licensing Client was already patched, reusing')
    } else {
        let found = false;
        for (const fileName of await fs.promises.readdir(clientDirectory)) {
            if (fileName === 'Unity.Licensing.EntitlementResolver.dll') {
                await patchBinary(
                    path.join(clientDirectory, fileName), path.join(patchedDirectory, fileName),
                    Buffer.from('6.x', 'utf16le'),
                    Buffer.from(licenseVersion, 'utf16le'),
                );
                found = true;
            } else {
                await fs.promises.symlink(path.join(clientDirectory, fileName), path.join(patchedDirectory, fileName));
            }
        }
        if (!found) {
            throw new Error('Could not find Unity.Licensing.EntitlementResolver.dll in the unityhub installation');
        }
    }
    client = path.join(patchedDirectory, path.basename(client));
    core.debug(`Unity Licensing Client patched successfully, new path: ${client}`);
    const unityCommonDir = getUnityCommonDir();
    const legacyLicenseFile = path.join(unityCommonDir, `Unity_v${licenseVersion}.ulf`);
    await fs.promises.mkdir(unityCommonDir, { recursive: true });
    try {
        await fs.promises.symlink(path.join(patchedDirectory, 'Unity_lic.ulf'), legacyLicenseFile);
    } catch (error) {
        if (error && (error as NodeJS.ErrnoException).code === 'EEXIST') {
            await fs.promises.unlink(legacyLicenseFile);
            await fs.promises.symlink(path.join(patchedDirectory, 'Unity_lic.ulf'), legacyLicenseFile);
        } else {
            throw error;
        }
    }
    process.env['UNITY_COMMON_DIR'] = patchedDirectory;
}

async function patchBinary(src: string, dest: string, searchValue: Buffer, replaceValue: Buffer): Promise<void> {
    const data = await fs.promises.readFile(src);
    let modified = false;
    for (let i = 0; i <= data.length - searchValue.length; i++) {
        if (data.subarray(i, i + searchValue.length).equals(searchValue)) {
            replaceValue.copy(data, i);
            modified = true;
            i += searchValue.length - 1;
        }
    }
    if (!modified) {
        throw new Error('Could not find the search value');
    }
    await fs.promises.writeFile(dest, data);
}

function getUnityCommonDir() {
    const result = process.env['UNITY_COMMON_DIR'];

    if (result) {
        return result;
    }

    const platform = os.platform();

    switch (platform) {
        case 'win32': {
            const programData = process.env['PROGRAMDATA'] || 'C:\\ProgramData';
            return path.join(programData, 'Unity');
        }
        case 'darwin': {
            return '/Library/Application Support/Unity';
        }
        case 'linux': {
            const dataHome = process.env['XDG_DATA_HOME'] || path.join(os.homedir(), '.local', 'share');
            return path.join(dataHome, 'unity3d', 'Unity');
        }
        default:
            throw new Error(`Failed to determine Unity common directory for platform: ${platform}`);
    }
}

async function execWithMask(args: string[], attempt: number = 0): Promise<string> {
    await PatchLicenseVersion();

    if (!client) {
        client = await getLicensingClient();
    }

    await fs.promises.access(client, fs.constants.X_OK);

    let output: string = '';
    let exitCode: number = 0;

    try {
        core.info(`[command]"${client}" ${args.join(' ')}`);
        exitCode = await exec.exec(`"${client}"`, args, {
            listeners: {
                stdout: (data) => {
                    output += data.toString();
                },
                stderr: (data) => {
                    output += data.toString();
                }
            },
            silent: true,
            ignoreReturnCode: true
        });
    } finally {
        const maskedOutput = maskSerialInOutput(output);
        const splitLines = maskedOutput.split(/\r?\n/);

        for (const line of splitLines) {
            if (!line || line.trim().length === 0) { continue; }
            core.info(line);
        }

        if (exitCode !== 0) {
            if (exitCode > 21 && attempt < 3) {
                core.error(`Unity Licensing Client failed with exit code ${exitCode}. Retrying...`);
                return await execWithMask(args, ++attempt);
            } else {
                throw new Error(`Unity Licensing Client failed with exit code ${exitCode}: ${getExitCodeMessage(exitCode)}`);
            }
        }
    }
    return output;
}

function maskSerialInOutput(output: string): string {
    return output.replace(/([\w-]+-XXXX)/g, (_, serial) => {
        const maskedSerial = serial.slice(0, -4) + `XXXX`;
        core.setSecret(maskedSerial);
        return serial;
    });
}

function getExitCodeMessage(exitCode: number): string {
    switch (exitCode) {
        case 0:
            return 'OK';
        case 1:
            return 'Invalid arguments';
        case 2:
            return 'Invalid credentials';
        case 3:
            return 'Organization ID is missing';
        case 4:
            return 'Package Access Control List file download failed';
        case 5:
            return 'Context initialization failed';
        case 6:
            return 'Replication service initialization failed';
        case 7:
            return 'Orchestrator initialization failed';
        case 8:
            return 'Floating service initialization failed';
        case 9:
            return 'Package service initialization failed';
        case 10:
            return 'Access token initialization failed';
        case 11:
            return 'Multi client pipe server start failed';
        case 12:
            return 'License activation generation failed';
        case 13:
            return 'Syncing entitlements failed';
        case 14:
            return 'No valid entitlement found';
        case 15:
            return 'License update failed';
        case 16:
            return 'Unable to get list of user seats';
        case 17:
            return 'Seat activation or deactivation failed';
        case 18:
            return 'Getting entitlements failed';
        case 19:
            return 'Acquiring license failed';
        case 20:
            return 'Renewing floating lease failed';
        case 21:
            return 'Returning floating lease failed';
        default:
            return `Unknown Error`;
    }
}

export async function Version(): Promise<void> {
    await execWithMask([`--version`]);
}

export async function ShowEntitlements(): Promise<LicenseType[]> {
    const output = await execWithMask([`--showEntitlements`]);
    const matches = output.matchAll(/Product Name: (?<license>.+)/g);
    const licenses: LicenseType[] = [];
    for (const match of matches) {
        if (match.groups.license) {
            switch (match.groups.license) {
                case 'Unity Pro':
                    if (!licenses.includes(LicenseType.professional)) {
                        licenses.push(LicenseType.professional);
                    }
                    break;
                case 'Unity Personal':
                    if (!licenses.includes(LicenseType.personal)) {
                        licenses.push(LicenseType.personal);
                    }
                    break;
                default:
                    throw Error(`Unsupported license type: ${match.groups.license}`);
            }
        }
    }
    return licenses;
}

export async function ActivateLicense(license: LicenseType, username: string, password: string, serial: string | undefined): Promise<void> {
    const args = [
        `--activate-ulf`,
        `--username`, username,
        `--password`, password,
    ];

    if (serial !== undefined && serial.length > 0) {
        serial = serial.trim();
        args.push(`--serial`, serial);
        const maskedSerial = serial.slice(0, -4) + `XXXX`;
        core.setSecret(maskedSerial);
    }

    if (license === LicenseType.personal) {
        args.push(`--include-personal`);
    }

    await execWithMask(args);
}

export async function ActivateLicenseWithConfig(servicesConfig: string): Promise<void> {
    const servicesConfigPath = path.join(servicesPath[process.platform], 'services-config.json');
    core.debug(`Services Config Path: ${servicesConfigPath}`);
    await fs.promises.writeFile(servicesConfigPath, Buffer.from(servicesConfig, 'base64'));
}

export async function ReturnLicense(license: LicenseType): Promise<void> {
    await execWithMask([`--return-ulf`]);
    const activeLicenses = await ShowEntitlements();

    if (license !== undefined &&
        activeLicenses.includes(license)) {
        throw Error(`${license} was not returned.`);
    }
}
