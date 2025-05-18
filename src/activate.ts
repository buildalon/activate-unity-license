import core = require('@actions/core');
import { env } from 'process';
import {
    ActivateLicense,
    ActivateLicenseWithConfig,
    ShowEntitlements,
    Version,
} from './licensing-client';

export async function Activate(): Promise<void> {
    let license = undefined;
    try {
        core.saveState('isPost', true);
        await Version();
        let activeLicenses = await ShowEntitlements();
        license = core.getInput('license', { required: true });
        switch (license.toLowerCase()) {
            case 'professional':
            case 'personal':
            case 'floating':
                break;
            default:
                throw Error(`Invalid License: ${license}! Must be Professional, Personal, or Floating.`);
        }
        core.saveState('license', license);
        if (activeLicenses.includes(license.toLocaleLowerCase())) {
            core.warning(`Unity ${license} License already activated!`);
            return;
        }
        core.startGroup('Attempting to activate Unity License...');
        try {
            if (license.toLowerCase().startsWith('f')) {
                const servicesConfig = core.getInput('services-config', { required: true });
                await ActivateLicenseWithConfig(servicesConfig);
            } else {
                const isPro = license.toLowerCase().startsWith('pro');
                let username = core.getInput('username', { required: isPro }).trim();
                let password = core.getInput('password', { required: isPro }).trim();
                const serial = core.getInput('serial', { required: isPro });
                if (!username) {
                    const encodedUsername = env['UNITY_USERNAME_BASE64'];
                    if (!encodedUsername) {
                        throw Error('Username is required for Unity License Activation!');
                    }

                    username = Buffer.from(encodedUsername, 'base64').toString('utf-8');
                }
                if (!password) {
                    const encodedPassword = env['UNITY_PASSWORD_BASE64'];
                    if (!encodedPassword) {
                        throw Error('Password is required for Unity License Activation!');
                    }

                    password = Buffer.from(encodedPassword, 'base64').toString('utf-8');
                }
                await ActivateLicense(username, password, serial);
            }
            activeLicenses = await ShowEntitlements();
            if (!activeLicenses.includes(license.toLowerCase())) {
                throw Error(`Failed to activate Unity License with ${license}!`);
            }
        } finally {
            core.endGroup();
        }
    } catch (error) {
        core.setFailed(`Unity License Activation Failed!\n${error}`);
        process.exit(1);
    }
    core.info(`Unity ${license} License Activated!`);
}
