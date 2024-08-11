const licenseClient = require('./licensing-client');
const core = require('@actions/core');
const { GetLogs } = require('./utility');

async function Activate() {
    let license = undefined;
    try {
        core.saveState('isPost', true);
        await licenseClient.Version();
        let activeLicenses = await licenseClient.ShowEntitlements();
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
                await licenseClient.ActivateLicenseWithConfig(servicesConfig);
            } else {
                const username = core.getInput('username', { required: true });
                const password = core.getInput('password', { required: true });
                const serial = core.getInput('serial', { required: license.toLowerCase().startsWith('pro') });
                await licenseClient.ActivateLicense(username, password, serial);
            }
            activeLicenses = await licenseClient.ShowEntitlements();
            if (!activeLicenses.includes(license.toLowerCase())) {
                throw Error(`Failed to activate Unity License with ${license}!`);
            }
        } finally {
            core.endGroup();
        }
    } catch (error) {
        core.setFailed(`Unity License Activation Failed!\n${error}`);
        GetLogs();
        process.exit(1);
    }
    core.info(`Unity ${license} License Activated!`);
}

module.exports = { Activate };
