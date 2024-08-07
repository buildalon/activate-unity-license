const { ResolveGlobPath, GetEditorRootPath, GetHubRootPath } = require('./utility');
const core = require('@actions/core');
const exec = require('@actions/exec');
const fs = require("fs").promises;
const path = require('path');

let client = undefined;

async function getLicensingClient() {
    core.debug('Getting Licensing Client...');
    const editorPath = process.env.UNITY_EDITOR_PATH;
    const version = process.env.UNITY_EDITOR_VERSION || editorPath.match(/(\d+\.\d+\.\d+[a-z]?\d?)/)[0];
    core.debug(`Unity Editor Path: ${editorPath}`);
    core.debug(`Unity Version: ${version}`);
    await fs.access(editorPath, fs.constants.X_OK);
    let licenseClientPath;
    const major = version.split('.')[0];
    // if 2019.3 or older, use unity hub licensing client
    if (major < 2020) {
        const unityHubPath = process.env.UNITY_HUB_PATH || process.env.HOME;
        core.debug(`Unity Hub Path: ${unityHubPath}`);
        await fs.access(unityHubPath, fs.constants.R_OK);
        // C:\Program Files\Unity Hub\UnityLicensingClient_V1
        // /Applications/Unity\ Hub.app/Contents/MacOS/Unity\ Hub/UnityLicensingClient_V1
        // ~/Applications/Unity\ Hub.AppImage/UnityLicensingClient_V1
        const rootHubPath = await GetHubRootPath(unityHubPath);
        const globs = [rootHubPath, '**'];
        if (process.platform === 'win32') {
            globs.push('Unity.Licensing.Client.exe');
        } else {
            globs.push('Unity.Licensing.Client');
        }
        licenseClientPath = await ResolveGlobPath(globs);
        core.debug(`Unity Licensing Client Path: ${licenseClientPath}`);
        await fs.access(licenseClientPath, fs.constants.X_OK);
        return licenseClientPath;
    }
    else {
        // Windows: <UnityEditorDir>\Data\Resources\Licensing\Client
        // macOS (Editor versions 2021.3.19f1 or later): <UnityEditorDir>/Contents/Frameworks/UnityLicensingClient.app/Contents/MacOS/
        // macOS (Editor versions earlier than 2021.3.19f1): <UnityEditorDir>/Contents/Frameworks/UnityLicensingClient.app/Contents/Resources/
        // Linux: <UnityEditorDir>/Data/Resources/Licensing/Client/
        const rootEditorPath = await GetEditorRootPath(editorPath);
        core.debug(`Root Editor Path: ${rootEditorPath}`);
        const globs = [rootEditorPath];
        switch (process.platform) {
            case 'win32':
                globs.push('Data\\Resources\\Licensing\\Client\\Unity.Licensing.Client.exe');
                break;
            case 'darwin':
                globs.push('Contents', 'Frameworks', 'UnityLicensingClient.app', '**', 'Unity.Licensing.Client');
                break;
            case 'linux':
                globs.push('Data', 'Resources', 'Licensing', 'Client', 'Unity.Licensing.Client');
        }
        try {
            licenseClientPath = path.resolve(...globs);
            core.debug(`Testing Unity Licensing Client Path: ${licenseClientPath}`);
            await fs.access(licenseClientPath, fs.constants.R_OK);
        } catch (error) {
            licenseClientPath = await ResolveGlobPath(globs);
        }
        core.debug(`Unity Licensing Client Path: ${licenseClientPath}`);
        await fs.access(licenseClientPath, fs.constants.X_OK);
        return licenseClientPath;
    }
};

async function execWithMask(args) {
    if (!client) {
        client = await getLicensingClient();
    }
    await fs.access(client, fs.constants.X_OK);
    let output = '';
    let exitCode = 0;
    try {
        core.info(`[command]"${client}" ${args.join(' ')}`);
        exitCode = await exec.exec(`"${client}"`, args, {
            silent: true,
            listeners: {
                stdout: (data) => {
                    output += data.toString();
                },
                stderr: (data) => {
                    output += data.toString();
                }
            }
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
};

function maskSerialInOutput(output) {
    return output.replace(/([\w-]+-XXXX)/g, (_, serial) => {
        const maskedSerial = serial.slice(0, -4) + `XXXX`;
        core.setSecret(maskedSerial);
        return serial;
    });
};

function getExitCodeMessage(exitCode) {
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
};

async function Version() {
    await execWithMask([`--version`]);
}

async function ShowEntitlements() {
    const output = await execWithMask([`--showEntitlements`]);
    const matches = output.matchAll(/Product Name: (?<license>.+)/g);
    const licenses = [];
    if (!matches || matches.length === 0) {
        return undefined;
    }
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

async function ActivateLicense(username, password, serial) {
    let args = [`--activate-ulf`, `--username`, username, `--password`, password];
    if (serial !== undefined && serial.length > 0) {
        args.push(`--serial`, serial);
        const maskedSerial = serial.slice(0, -4) + `XXXX`;
        core.setSecret(maskedSerial);
    }
    await execWithMask(args);
}

async function ActivateLicenseWithConfig(servicesConfig) {
    const servicesConfigPath = path.join(servicesPath[process.platform], 'services-config.json');
    core.debug(`Services Config Path: ${servicesConfigPath}`);
    await fs.writeFile(servicesConfigPath, Buffer.from(servicesConfig, 'base64'));
}

async function ReturnLicense(license) {
    await execWithMask([`--return-ulf`]);
    const activeLicenses = await ShowEntitlements();
    if (license !== undefined &&
        activeLicenses.includes(license.toLowerCase())) {
        throw Error(`${license} was not returned.`);
    }
}

module.exports = { Version, ShowEntitlements, ActivateLicense, ActivateLicenseWithConfig, ReturnLicense };
