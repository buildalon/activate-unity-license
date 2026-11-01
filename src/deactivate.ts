import core = require('@actions/core');
import {
    LicenseType,
    ReturnLicense,
    ReturnWhen
} from '@rage-against-the-pixel/unity-cli';

export const SEAT_FIX = 'Release it at https://id.unity.com under My Seats, or set `return-license: always`.';

export async function Deactivate(): Promise<void> {
    let license: LicenseType | undefined = undefined;

    try {
        license = core.getState('license') as LicenseType | undefined;

        if (!license) {
            core.info('No license was activated, so there is nothing to return.');
            return;
        }

        let when = (core.getState('return-license') || 'auto') as ReturnWhen;

        // auto skips the return on GitHub-hosted macOS and Linux runners, which share one machine identity; a
        // professional serial only has two activations, so it is always returned rather than left holding a seat
        if (license === LicenseType.professional && when === 'auto') {
            when = 'always';
        }

        if (license === LicenseType.professional && when === 'never') {
            core.warning(`The Unity professional license was not returned, so it keeps holding a seat. ${SEAT_FIX}`);
        }

        const token = core.getState('activation-token');
        core.debug(`post state: ${license}, return-license: ${when}`);
        core.info(`Unity ${license} License Deactivation...`);
        // floating licenses always release their lease
        await ReturnLicense(license, token || undefined, when);
    } catch (error) {
        core.error(`Failed to deactivate license!\n${error}`);

        if (license === LicenseType.professional) {
            core.warning(`The Unity professional license could not be returned, so it may keep holding a seat. ${SEAT_FIX}`);
        }
    } finally {
        // always exit 0 to not fail the job if deactivation fails
        process.exit(0);
    }
}
