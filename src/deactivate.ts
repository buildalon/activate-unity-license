import licensingClient = require('./licensing-client');
import core = require('@actions/core');
import { LicenseType } from './types';

export async function Deactivate(): Promise<void> {
    try {
        const license: LicenseType | undefined = core.getState('license') as LicenseType | undefined;

        if (!license) {
            core.error(`Failed to get license state!`);
            return;
        }

        core.debug(`post state: ${license}`);

        if (license === LicenseType.floating) {
            return;
        }

        core.startGroup(`Unity ${license} License Deactivation...`);

        try {
            const activeLicenses = await licensingClient.ShowEntitlements();

            if (license !== undefined &&
                activeLicenses.includes(license)) {
                await licensingClient.ReturnLicense(license);
                core.info(`Unity ${license} License successfully returned.`);
            }
        }
        finally {
            core.endGroup();
        }
    } catch (error) {
        core.error(`Failed to deactivate license!\n${error}`);
    } finally {
        process.exit(0);
    }
}
