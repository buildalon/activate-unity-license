const core = require('@actions/core');
const glob = require('@actions/glob');
const fs = require("fs").promises;
const path = require('path');
const { DefaultArtifactClient } = require('@actions/artifact');

async function GetHubRootPath(hubPath) {
    core.debug(`searching for hub root path: ${hubPath}`);
    let hubRootPath = hubPath;
    switch (process.platform) {
        case 'darwin':
            hubRootPath = path.join(hubPath, '../../../');
            break;
        case 'win32':
            hubRootPath = path.join(hubPath, '../');
            break
        case 'linux':
            hubRootPath = path.join(hubPath, '../');
            break;
    }
    return hubRootPath;
}

async function GetEditorRootPath(editorPath) {
    core.debug(`searching for editor root path: ${editorPath}`);
    let editorRootPath = editorPath;
    switch (process.platform) {
        case 'darwin':
            editorRootPath = path.join(editorPath, '../../../');
            break;
        case 'win32':
            editorRootPath = path.join(editorPath, '../');
            break
        case 'linux':
            editorRootPath = path.join(editorPath, '../');
            break;
    }
    await fs.access(editorRootPath, fs.constants.R_OK);
    core.debug(`found editor root path: ${editorRootPath}`);
    return editorRootPath;
}

async function ResolveGlobPath(globs) {
    const globPath = path.join(...globs);
    const result = await findGlobPattern(globPath);
    if (result === undefined) {
        throw Error(`Failed to resolve glob: ${globPath}`);
    }
    await fs.access(result, fs.constants.R_OK);
    return result;
}

async function findGlobPattern(pattern) {
    core.debug(`searching for: ${pattern}...`);
    const globber = await glob.create(pattern);
    for await (const file of globber.globGenerator()) {
        core.debug(`found glob: ${file}`);
        return file;
    }
}

async function GetLogs() {
    try {
        const logPath = logPaths[process.platform];
        const auditLogPath = auditLogPaths[process.platform];
        const artifact = new DefaultArtifactClient();
        const artifactName = `LicenseLogs-${process.platform}-${new Date().toISOString().replace(/:/g, '-')}`;
        core.info(`Uploading logs ${artifactName}...`);
        await artifact.uploadArtifact(artifactName, [logPath, auditLogPath], rootLogDir[process.platform], {
            retentionDays: 1,
            compressionLevel: 0
        });
    } catch (error) {
        core.warning(`Failed to upload logs!\n${error}`);
    }
}

const rootLogDir = {
    'win32': '%LOCALAPPDATA%\\Unity',
    'darwin': '~/Library/Logs/Unity/',
    'linux': '~/.config/unity3d/Unity/'
}

const logPaths = {
    'win32': '%LOCALAPPDATA%\\Unity\\Unity.Licensing.Client.log',
    'darwin': '~/Library/Logs/Unity/Unity.Licensing.Client.log',
    'linux': '~/.config/unity3d/Unity/Unity.Licensing.Client.log'
}

const auditLogPaths = {
    'win32': '%LOCALAPPDATA%\Unity\Unity.Entitlements.Audit.log',
    'darwin': '~/Library/Logs/Unity/Unity.Entitlements.Audit.log',
    'linux': '~/.config/unity3d/Unity/Unity.Entitlements.Audit.log'
}

module.exports = { ResolveGlobPath, GetEditorRootPath, GetHubRootPath, GetLogs };
