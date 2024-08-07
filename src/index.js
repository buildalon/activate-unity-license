const core = require('@actions/core');
const { Activate } = require('./activate');
const { Deactivate } = require('./deactivate');

const IsPost = !!core.getState('isPost');

const main = async () => {
    if (!IsPost) {
        await Activate();
    } else {
        await Deactivate();
    }
    process.exit(0);
}

main();
