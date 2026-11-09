import * as core from '@actions/core';
import { Activate } from './activate';
import { Deactivate } from './deactivate';

const IsPost = !!core.getState('isPost');

const main = async () => {
    if (!IsPost) {
        await Activate();
    } else {
        await Deactivate();
    }
}

main();
