import { expect, it } from 'vitest';
import { App, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { loggedNodejsFunction, type LoggedNodejsFunctionProps } from '../lib/logged-nodejs-function.js';

it.each(['runtime', 'bundling', 'logGroup', 'logRetention', 'logRetentionRole', 'logRetentionRetryOptions'])(
  'refuses caller overrides of %s before creating resources', setting => {
    // A JavaScript caller must not bypass the common runtime/bundling/logging contract via a cast.
    const stack = new Stack(new App(), 'RejectedOverride');
    const props = { log: { id: 'Logs', retention: 7, removalPolicy: RemovalPolicy.RETAIN },
      function: { [setting]: undefined } } as unknown as LoggedNodejsFunctionProps;
    expect(() => loggedNodejsFunction(stack, 'Handler', props)).toThrow('factory owns');
    expect(Template.fromStack(stack).toJSON().Resources).toBeUndefined();
  },
);
