import { ResolveGlobPath, GetHubRootPath } from './utility';
import core = require('@actions/core');
import exec = require('@actions/exec');
import path = require('path');
import fs = require('fs');

let client = undefined;

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

async function execWithMask(args: string[]): Promise<string> {
    if (!client) {
        client = await getLicensingClient();
    }
    await fs.promises.access(client, fs.constants.X_OK);
    let output = '';
    let exitCode = 0;
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
            if (line === undefined || line.length === 0) { continue; }
            core.info(line);
        }
        if (exitCode !== 0) {
            throw Error(getExitCodeMessage(exitCode));
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
            return 'Unknown error';
    }
}

const servicesPath = {
    win32: path.join(process.env.PROGRAMDATA || '', 'Unity', 'config'),
    darwin: path.join('/Library', 'Application Support', 'Unity', 'config'),
    linux: path.join('/usr', 'share', 'unity3d', 'config')
}

async function Version(): Promise<void> {
    await execWithMask([`--version`]);
}

async function ShowEntitlements(): Promise<string[]> {
    const output = await execWithMask([`--showEntitlements`]);
    const matches = output.matchAll(/Product Name: (?<license>.+)/g);
    const licenses = [];
    for (const match of matches) {
        if (match.groups.license) {
            switch (match.groups.license) {
                case 'Unity Pro':
                    if (!licenses.includes('professional')) {
                        licenses.push('professional');
                    }
                    break;
                case 'Unity Personal':
                    if (!licenses.includes('personal')) {
                        licenses.push('personal');
                    }
                    break;
            }
        }
    }
    return licenses;
}

async function ActivateLicense(username: string, password: string, serial: string): Promise<void> {
    const args = [`--activate-ulf`, `--username`, username, `--password`, password];
    if (serial !== undefined && serial.length > 0) {
        serial = serial.trim();
        args.push(`--serial`, serial);
        const maskedSerial = serial.slice(0, -4) + `XXXX`;
        core.setSecret(maskedSerial);
    }
    await execWithMask(args);
}

async function ActivateLicenseWithConfig(servicesConfig: string): Promise<void> {
    const servicesConfigPath = path.join(servicesPath[process.platform], 'services-config.json');
    core.debug(`Services Config Path: ${servicesConfigPath}`);
    await fs.promises.writeFile(servicesConfigPath, Buffer.from(servicesConfig, 'base64'));
}

async function ReturnLicense(license: string): Promise<void> {
    await execWithMask([`--return-ulf`]);
    const activeLicenses = await ShowEntitlements();
    if (license !== undefined &&
        activeLicenses.includes(license.toLowerCase())) {
        throw Error(`${license} was not returned.`);
    }
}

export { Version, ShowEntitlements, ActivateLicense, ActivateLicenseWithConfig, ReturnLicense }
