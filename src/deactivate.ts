import core = require('@actions/core');
import {
    LicenseType,
    LicensingClient
} from '@rage-against-the-pixel/unity-cli';

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

        core.info(`Unity ${license} License Deactivation...`);
        await new LicensingClient().Deactivate(license);
    } catch (error) {
        core.error(`Failed to deactivate license!\n${error}`);
    } finally {
        // always exit 0 to not fail the job if deactivation fails
        process.exit(0);
    }
}
