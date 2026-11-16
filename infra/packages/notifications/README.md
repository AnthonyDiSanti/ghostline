# AWS notifications

Self-contained CDK constructs for SNS alarm/event routing and an email subscription whose address stays in a regional SecureString parameter. Build with `npm install && npm run build`; CDK consumers use TypeScript/tsx and esbuild. No Ghostline or personal-assistant runtime resources are required.

The notification registry and subscription pattern derive from Anthony's personal-assistant `notification-registry.ts` and `managed-topic-email-subscription.ts`. This extraction removes its legacy logical IDs, managed-function scaffolding and unnecessary event-to-metric bridge for SNS-only consumers. AWS User Notifications integration is outside this package's current scope.

Email subscription confirmation is still performed by the recipient. The provider never logs parameter values and identifies subscriptions with a hash instead of embedding the email in CloudFormation IDs. Use a dedicated topic: the resource owns the subscriptions it creates there.

The custom resource reconciles the saved recipient on CloudFormation create/update and treats pending confirmations as existing subscriptions, avoiding repeated confirmation requests on ordinary updates. It is not a continuous reconciler: an unchanged stack does not repair a subscriber that later disappears. [SNS deletes ordinary unconfirmed subscriptions after 48 hours](https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html). A successful custom resource alone therefore does not prove an active email recipient or alert receipt. Missing subscribers require an explicit repair using the existing saved contact; preserve the deployed resource identity instead of renaming the construct or changing recipients to force an update.
