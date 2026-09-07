import { afterAll, describe, expect, it } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { getDeployment, validateDeployment, type DeploymentConfig } from '../lib/config.js';
import { launch } from './fixture.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
function template(stage: NonNullable<DeploymentConfig['runtime']>['stage'], awgEnabled = false) {
  // Each transition uses the real builder; compare resource identities instead of whole-template snapshots.
  return Template.fromStack(buildApp(launch, { ...getDeployment('cape-town'), account: '000000000000', runtime: { stage, awgEnabled } }).stack).toJSON();
}
function resources(value: any, type: string): Record<string, any> {
  return Object.fromEntries(Object.entries(value.Resources).filter(([, resource]: any) => resource.Type === `AWS::EC2::${type}`));
}

describe('staged ownership migration', () => {
  const reference = template('reference');
  const prepared = template('prepared');
  const cutover = template('cutover');
  const managed = template('managed');
  const dual = template('managed', true);
  const addressId = Object.keys(resources(reference, 'EIP'))[0]!;
  const associationId = Object.keys(resources(reference, 'EIPAssociation'))[0]!;
  const oldHostId = Object.keys(resources(reference, 'Instance'))[0]!;

  it('leaves every reference resource unchanged during preparation', () => {
    for (const [id, resource] of Object.entries(reference.Resources)) expect(prepared.Resources[id]).toEqual(resource);
    expect(Object.keys(resources(prepared, 'Instance'))).toHaveLength(2);
    expect(Object.keys(resources(prepared, 'EIP'))).toHaveLength(2);
    expect(prepared.Outputs.InstanceId).toEqual(reference.Outputs.InstanceId);
  });
  it('preserves the EIP allocation through every stage and only moves its association', () => {
    for (const value of [prepared, cutover, managed, dual]) expect(value.Resources[addressId]).toEqual(reference.Resources[addressId]);
    expect(prepared.Resources[associationId]).toEqual(reference.Resources[associationId]);
    expect(cutover.Resources[associationId].Properties).not.toHaveProperty('InstanceId');
    expect(cutover.Resources[associationId].Properties.NetworkInterfaceId).toEqual(cutover.Outputs.ManagedNetworkInterfaceId.Value);
    expect(cutover.Resources[associationId].Properties.PrivateIpAddress).toEqual(cutover.Outputs.XrayPrivateIp.Value);
    expect(cutover.Resources[oldHostId]).toEqual(reference.Resources[oldHostId]);
  });
  it('retires only the reference host and keeps one dual-address managed host', () => {
    expect(managed.Resources).not.toHaveProperty(oldHostId);
    expect(Object.keys(resources(managed, 'Instance'))).toHaveLength(1);
    const nic = Object.values(resources(managed, 'NetworkInterface'))[0];
    expect(nic.Properties.SecondaryPrivateIpAddressCount).toBe(1);
    expect(managed.Outputs.ManagedInstanceId).toEqual(prepared.Outputs.ManagedInstanceId);
    expect(managed.Outputs).not.toHaveProperty('ReferenceInstanceId');
  });
  it('opens AWG only after the completed migration, without replacing Xray resources', () => {
    expect(() => validateDeployment({ ...getDeployment('cape-town'), runtime: { stage: 'cutover', awgEnabled: true } })).toThrow('AWG');
    for (const value of [prepared, cutover, managed]) {
      expect(Object.values(resources(value, 'SecurityGroup')).flatMap(r => r.Properties.SecurityGroupIngress).some(r => r.IpProtocol === 'udp')).toBe(false);
    }
    const changed = Object.keys(managed.Resources).filter(id => JSON.stringify(managed.Resources[id]) !== JSON.stringify(dual.Resources[id]));
    expect(changed).toHaveLength(1);
    expect(dual.Resources[changed[0]!].Type).toBe('AWS::EC2::SecurityGroup');
  });
  it('allocates shared host costs and distinct protocol address costs without extra services', () => {
    expect(Object.values(resources(dual, 'Instance'))[0].Properties.Tags).toContainEqual({ Key: 'System', Value: 'shared' });
    expect(Object.values(resources(dual, 'EIP')).map(r => r.Properties.Tags.find((tag: any) => tag.Key === 'System').Value).sort()).toEqual(['amneziawg', 'xray']);
    expect(Object.values(dual.Resources).some((r: any) => /AWS::(?:IAM|ECR|ECS|Lambda|S3)::/.test(r.Type))).toBe(false);
  });
});
