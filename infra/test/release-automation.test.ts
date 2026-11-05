import { describe, expect, it } from 'vitest';
import { allowedReleaseMode, dnsPublicationControllerMode, mayReconcileRelease, releaseAutomationMode } from '../lib/releases/automation.js';

it('admits DNS publication with homogeneous manual migration or active controllers', () => {
  expect(dnsPublicationControllerMode(['manual', 'manual'])).toBe('manual');
  expect(dnsPublicationControllerMode(['active', 'active'])).toBe('active');
  expect(() => dnsPublicationControllerMode(['active', 'manual'])).toThrow('same active or manual mode');
  expect(() => dnsPublicationControllerMode(['held', 'held'])).toThrow('same active or manual mode');
  expect(() => dnsPublicationControllerMode([])).toThrow('same active or manual mode');
});
import type { LifecycleState } from '../lib/releases/lifecycle.js';

const claim: LifecycleState = { version: 4, mode: 'active', operation: {
  kind: 'release', owner: 'regional-release-controller', startedAt: 1 } };

describe('regional release automation mode', () => {
  it('permits explicit manual operation under a global publication hold without enabling automatic selection', () => {
    expect(allowedReleaseMode(false, 'manual')).toBe('manual');
    expect(allowedReleaseMode(false, 'active')).toBe('held');
    expect(allowedReleaseMode(false, 'held')).toBe('held');
    expect(allowedReleaseMode(true, 'manual')).toBe('manual');
    expect(allowedReleaseMode(true, 'active')).toBe('active');
  });
  it('fails closed for unknown deployed mode', () => {
    expect(releaseAutomationMode('enabled')).toBe('active');
    expect(releaseAutomationMode('disabled')).toBe('held');
    expect(releaseAutomationMode('disabled', 'enabled')).toBe('manual');
    expect(() => releaseAutomationMode('enabled', 'enabled')).toThrow('Invalid');
    expect(() => releaseAutomationMode('disabled', 'unexpected')).toThrow('Invalid');
    expect(() => releaseAutomationMode(undefined)).toThrow('Invalid');
  });

  it('continues only operator-handed-off work in manual mode', () => {
    expect(mayReconcileRelease('manual', false)).toBe(false);
    expect(mayReconcileRelease('manual', false, claim)).toBe(false);
    expect(mayReconcileRelease('manual', false, { ...claim, operation: undefined }, 'network')).toBe(false);
    expect(mayReconcileRelease('manual', false, { ...claim, operation: { ...claim.operation!, kind: 'deploy' } }, 'network')).toBe(false);
    expect(mayReconcileRelease('manual', false, { ...claim, operation: { ...claim.operation!, owner: 'other' } }, 'network')).toBe(false);
    expect(mayReconcileRelease('manual', false, claim, 'network')).toBe(true);
    expect(mayReconcileRelease('manual', false, claim, 'deployment')).toBe(true);
    expect(mayReconcileRelease('manual', false, claim, 'complete')).toBe(false);
    expect(mayReconcileRelease('manual', false, claim, 'held')).toBe(false);
    expect(mayReconcileRelease('manual', false, claim, 'cleaned')).toBe(false);
    expect(mayReconcileRelease('manual', false, claim, 'retired')).toBe(false);
    expect(mayReconcileRelease('manual', false, claim, 'held', 'cleanup-failed')).toBe(true);
    expect(mayReconcileRelease('manual', false, undefined, 'cleaned', 'retry')).toBe(true);
    expect(mayReconcileRelease('manual', false, { ...claim, operation: { ...claim.operation!, kind: 'release-cleanup' } }, 'drain')).toBe(true);
    expect(mayReconcileRelease('manual', false, { ...claim, operation: { ...claim.operation!, kind: 'release-cleanup' } }, 'network')).toBe(false);
    expect(mayReconcileRelease('manual', true)).toBe(true);
    expect(mayReconcileRelease('held', false, claim)).toBe(false);
    expect(mayReconcileRelease('held', true)).toBe(true);
    expect(mayReconcileRelease('active', false)).toBe(true);
  });
});
