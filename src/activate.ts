import core = require('@actions/core');
import {
    LicenseType,
    LicensingClient,
} from '@rage-against-the-pixel/unity-cli';

export async function Activate(): Promise<void> {
    let licensingClient: LicensingClient;
    let licenseType: LicenseType | undefined = undefined;

    try {
        core.saveState('isPost', true);
        licensingClient = new LicensingClient(core.getInput('license-version'));
        const licenseInput = core.getInput('license', { required: true });
        licenseType = licenseInput.toLowerCase() as LicenseType;

        switch (licenseType) {
            case LicenseType.professional:
            case LicenseType.personal:
            case LicenseType.floating:
                break;
            default:
                throw Error(`Invalid License: ${licenseInput}! Must be one of: ${Object.values(LicenseType).join(', ')}`);
        }

        core.saveState('license', licenseType);
        let activeLicenses = await licensingClient.GetActiveEntitlements();

        if (activeLicenses.includes(licenseType)) {
            core.info(`Unity ${licenseType} License already activated!`);
            process.exit(0);
        }

        core.startGroup('Attempting to activate Unity License...');

        try {
            let servicesConfig: string | undefined = undefined;
            let username: string | undefined = undefined;
            let password: string | undefined = undefined;
            let serial: string | undefined = undefined;

            if (licenseType === LicenseType.floating) {
                servicesConfig = core.getInput('services-config', { required: true });
            } else {
                username = core.getInput('username', { required: false }).trim();
                password = core.getInput('password', { required: false }).trim();
                serial = core.getInput('serial');

                if (!username) {
                    const encodedUsername = process.env.UNITY_USERNAME_BASE64;

                    if (!encodedUsername) {
                        throw Error('Username is required for Unity License Activation!');
                    }

                    username = Buffer.from(encodedUsername, 'base64').toString('utf-8').trim();
                }

                const emailRegex: RegExp = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

                if (username.length === 0 || !emailRegex.test(username)) {
                    throw Error('Username must be your Unity ID email address!');
                }

                if (!password) {
                    const encodedPassword = process.env.UNITY_PASSWORD_BASE64;

                    if (!encodedPassword) {
                        throw Error('Password is required for Unity License Activation!');
                    }

                    password = Buffer.from(encodedPassword, 'base64').toString('utf-8').trim();
                }

                if (password.length === 0) {
                    throw Error('Password is required for Unity License Activation!');
                }
            }

            await licensingClient.Activate({ licenseType, servicesConfig, serial, username, password });
            activeLicenses = await licensingClient.GetActiveEntitlements();

            if (!activeLicenses.includes(licenseType)) {
                throw Error(`Failed to activate Unity License with ${licenseType}!`);
            }
        } finally {
            core.endGroup();
        }

        core.info(`Unity ${licenseType} License Activated!`);
    } catch (error) {
        core.setFailed(`Unity License Activation Failed!\n${error}`);
        process.exit(1);
    }
}
