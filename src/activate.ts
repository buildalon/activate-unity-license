import core = require('@actions/core');
import { env } from 'process';
import {
    ActivateLicense,
    ActivateLicenseWithConfig,
    ShowEntitlements,
    Version,
} from './licensing-client';
import { LicenseType } from './types';

export async function Activate(): Promise<void> {
    let license: LicenseType | undefined = undefined;

    try {
        core.saveState('isPost', true);
        await Version();
        const licenseInput = core.getInput('license', { required: true });
        license = licenseInput.toLowerCase() as LicenseType;

        switch (license) {
            case LicenseType.professional:
            case LicenseType.personal:
            case LicenseType.floating:
                break;
            default:
                throw Error(`Invalid License: ${license}! Must be one of: ${Object.values(LicenseType).join(', ')}`);
        }

        core.saveState('license', license);
        let activeLicenses = await ShowEntitlements();

        if (activeLicenses.includes(license)) {
            core.info(`Unity ${license} License already activated!`);
            process.exit(0);
        }

        core.startGroup('Attempting to activate Unity License...');

        try {
            if (license === LicenseType.floating) {
                const servicesConfig = core.getInput('services-config', { required: true });
                await ActivateLicenseWithConfig(servicesConfig);
            } else {
                let username = core.getInput('username', { required: false }).trim();
                let password = core.getInput('password', { required: false }).trim();
                const serial = core.getInput('serial');

                if (!username) {
                    const encodedUsername = env['UNITY_USERNAME_BASE64'];

                    if (!encodedUsername) {
                        throw Error('Username is required for Unity License Activation!');
                    }

                    username = Buffer.from(encodedUsername, 'base64').toString('utf-8').trim();
                }

                if (username.length === 0 || !username.includes('@')) {
                    throw Error('Username must be your Unity ID email address!');
                }

                if (!password) {
                    const encodedPassword = env['UNITY_PASSWORD_BASE64'];

                    if (!encodedPassword) {
                        throw Error('Password is required for Unity License Activation!');
                    }

                    password = Buffer.from(encodedPassword, 'base64').toString('utf-8').trim();
                }

                if (password.length === 0) {
                    throw Error('Password is required for Unity License Activation!');
                }

                await ActivateLicense(license, username, password, serial);
            }

            activeLicenses = await ShowEntitlements();

            if (!activeLicenses.includes(license)) {
                throw Error(`Failed to activate Unity License with ${license}!`);
            }
        } finally {
            core.endGroup();
        }

        core.info(`Unity ${license} License Activated!`);
    } catch (error) {
        core.setFailed(`Unity License Activation Failed!\n${error}`);
        process.exit(1);
    }
}
