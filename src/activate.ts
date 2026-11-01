import core = require('@actions/core');
import {
    ActivateLicense,
    LicenseType,
} from '@rage-against-the-pixel/unity-cli';
import { ClassifyFailure, LICENSE_EXHAUSTED_MARKER } from '@rage-against-the-pixel/unity-cli/dist/failure-markers';
import { SEAT_FIX } from './deactivate';

export async function Activate(): Promise<void> {
    let licenseType: LicenseType | undefined = undefined;

    try {
        core.saveState('isPost', true);
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

        const returnLicense = (core.getInput('return-license') || 'auto').trim().toLowerCase();

        if (!['auto', 'always', 'never'].includes(returnLicense)) {
            throw Error(`Invalid return-license: ${returnLicense}! Must be one of: auto, always, never`);
        }

        core.saveState('return-license', returnLicense);
        core.info('Attempting to activate Unity License...');

        let servicesConfig: string | undefined = undefined;
        let username: string | undefined = undefined;
        let password: string | undefined = undefined;
        let serial: string | undefined = undefined;

        if (licenseType === LicenseType.floating) {
            const configuration = core.getInput('configuration', { required: false }).trim();
            const legacyServicesConfig = core.getInput('services-config', { required: false }).trim();

            if (legacyServicesConfig) {
                core.warning(
                    'Input `services-config` is deprecated; use `configuration` instead.',
                );
            }

            if (configuration && legacyServicesConfig) {
                core.warning(
                    'Both `configuration` and `services-config` were set; `configuration` is used.',
                );
            }

            servicesConfig = configuration || legacyServicesConfig;

            if (!servicesConfig) {
                throw Error(
                    'Unity License Client configuration is required for floating license activations. Use the `configuration` input.',
                );
            }
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

            core.setSecret(username);
            core.setSecret(password);

            if (serial) {
                core.setSecret(serial);
            }
        }

        // tries a cached license file (UNITY_LICENSE) and the official Unity CLI before the Unity Licensing Client;
        // 4.x and 5.x editors are detected from the installed editor and use their own license version
        const token = await ActivateLicense({ licenseType, servicesConfig, serial, username, password });
        // saved only once activation succeeded, so a failed activation never returns a license it did not activate
        core.saveState('license', licenseType);

        if (token) {
            core.saveState('activation-token', token);
        }

        core.info(`Unity ${licenseType} License Activated!`);
    } catch (error) {
        // a seat limit or network failure gets a notice titled with its marker, so a rerun workflow can retry it
        const message = error instanceof Error ? error.message : String(error);
        const marker = ClassifyFailure(message);

        if (marker) {
            core.notice(`Retryable failure: ${message}`, { title: marker });
        }

        if (marker === LICENSE_EXHAUSTED_MARKER && licenseType === LicenseType.professional) {
            core.warning(`The Unity professional serial may have no free activations. ${SEAT_FIX}`);
        }

        core.setFailed(`Unity License Activation Failed!\n${error}`);
        process.exit(1);
    }
}
