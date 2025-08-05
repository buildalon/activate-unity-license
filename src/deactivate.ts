import licensingClient = require('./licensing-client');
import core = require('@actions/core');
import { LicenseType } from './types';

export async function Deactivate(): Promise<void> {
    try {
        const license: LicenseType | undefined = core.getState('license') as LicenseType | undefined;
        if (!license) {
            throw Error(`Failed to get post license state!`);
        }
        core.debug(`post state: ${license}`);
        if (license.startsWith('f')) {
            return;
        }
        core.startGroup(`Unity License Deactivation...`);
        try {
            const activeLicenses = await licensingClient.ShowEntitlements();
            if (license !== undefined &&
                !activeLicenses.includes(license)) {
                throw Error(`Unity ${license} License is not activated!`);
            } else {
                await licensingClient.ReturnLicense(license);
            }
        }
        finally {
            core.endGroup();
        }
        core.info(`Unity ${license} License successfully returned.`);
    } catch (error) {
        core.error(`Failed to deactivate license!\n${error}`);
        process.exit(0);
    }
}
