import core = require('@actions/core');
import glob = require('@actions/glob');
import path = require('path');
import fs = require('fs');

async function GetHubRootPath(hubPath: string): Promise<string> {
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

async function ResolveGlobPath(globs: string[]): Promise<string> {
    const globPath = path.join(...globs);
    const result = await findGlobPattern(globPath);
    if (result === undefined) {
        throw Error(`Failed to resolve glob: ${globPath}`);
    }
    await fs.promises.access(result, fs.constants.R_OK);
    return result;
}

async function findGlobPattern(pattern: string): Promise<string | undefined> {
    core.debug(`searching for: ${pattern}...`);
    const globber = await glob.create(pattern);
    for await (const file of globber.globGenerator()) {
        core.debug(`found glob: ${file}`);
        return file;
    }
}

export { ResolveGlobPath, GetHubRootPath }
