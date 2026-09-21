# AWS notifications

Self-contained CDK constructs for SNS alarm/event routing and an email subscription whose address stays in a regional SecureString parameter. Build with `npm install && npm run build`; CDK consumers use TypeScript/tsx and esbuild. No Ghostline or personal-assistant runtime resources are required.

The notification registry and subscription pattern derive from Anthony's personal-assistant `notification-registry.ts` and `managed-topic-email-subscription.ts`. This extraction removes its legacy logical IDs, managed-function scaffolding and unnecessary event-to-metric bridge for SNS-only consumers. AWS User Notifications integration is outside this package's current scope.

Email subscription confirmation is still performed by the recipient. The provider never logs parameter values and identifies subscriptions with a hash instead of embedding the email in CloudFormation IDs. Use a dedicated topic: the resource owns the subscriptions it creates there.
