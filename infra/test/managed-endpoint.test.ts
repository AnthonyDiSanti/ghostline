import { afterAll, describe, expect, it } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import { CloudAssembly } from 'aws-cdk-lib/cx-api';
import { buildApp } from '../lib/app.js';
import { getDeployment, validateDeployment, type DeploymentConfig } from '../lib/config.js';
import { launch } from './fixture.js';

afterAll(() => CloudAssembly.cleanupTemporaryDirectories());
function template(managed: boolean, awgEnabled = false) {
  // Compare permanent resource identities through the real app builder.
  return Template.fromStack(buildApp(launch, { ...getDeployment('cape-town'), account: '000000000000', runtime: managed ? { awgEnabled } : undefined }).stack).toJSON();
}
function resources(value: any, type: string): Record<string, any> {
  return Object.fromEntries(Object.entries(value.Resources).filter(([, resource]: any) => resource.Type === `AWS::EC2::${type}`));
}

describe('managed endpoint', () => {
  const reference = template(false);
  const managed = template(true);
  const dual = template(true, true);

  it('preserves the retained Xray allocation and existing SSH key', () => {
    expect(resources(managed, 'KeyPair')).toEqual(resources(reference, 'KeyPair'));
    expect(managed.Resources.EndpointPublicAddressC5ADF392).toEqual(reference.Resources.EndpointPublicAddressC5ADF392);
    expect(managed.Resources.EndpointAddressAssociationB713764C.Properties).toMatchObject({
      NetworkInterfaceId: managed.Outputs.ManagedNetworkInterfaceId.Value,
      PrivateIpAddress: managed.Outputs.XrayPrivateIp.Value,
    });
  });
  it('keeps one host, one dual-address ENI and two retained EIPs', () => {
    expect(Object.keys(resources(managed, 'Instance'))).toEqual(['ManagedHostInstanceC613EA2E']);
    expect(Object.keys(resources(managed, 'NetworkInterface'))).toEqual(['ManagedHostNetworkInterface04E6CB3B']);
    expect(Object.values(resources(managed, 'NetworkInterface'))[0].Properties.SecondaryPrivateIpAddressCount).toBe(1);
    expect(Object.keys(resources(managed, 'EIP'))).toHaveLength(2);
    for (const address of Object.values(resources(managed, 'EIP'))) expect(address.DeletionPolicy).toBe('Retain');
    expect(managed.Resources.ManagedHostAwgAssociation697F5F71.Properties.PrivateIpAddress).toEqual(managed.Outputs.AwgPrivateIp.Value);
    expect(Object.keys(resources(managed, 'SecurityGroup'))).toEqual(['ManagedHostSecurityGroup84B2B5B4']);
    expect(managed.Outputs).not.toHaveProperty('ReferenceInstanceId');
  });
  it('opens UDP 443 without changing host, key or address resources', () => {
    const changed = Object.keys(managed.Resources).filter(id => JSON.stringify(managed.Resources[id]) !== JSON.stringify(dual.Resources[id]));
    expect(changed).toEqual(['ManagedHostSecurityGroup84B2B5B4']);
    expect(dual.Resources[changed[0]!].Properties.SecurityGroupIngress).toContainEqual(expect.objectContaining({ IpProtocol: 'udp', FromPort: 443, ToPort: 443 }));
    expect(Object.values(resources(managed, 'SecurityGroup')).flatMap(r => r.Properties.SecurityGroupIngress).some(r => r.IpProtocol === 'udp')).toBe(false);
  });
  it('rejects obsolete migration stages instead of silently applying them', () => {
    const obsolete = { ...getDeployment('cape-town'), runtime: { stage: 'cutover', awgEnabled: true } };
    expect(() => validateDeployment(obsolete as DeploymentConfig)).toThrow('Migration stages are retired');
  });
  it('allocates shared host costs and distinct protocol address costs without extra services', () => {
    expect(Object.values(resources(dual, 'Instance'))[0].Properties.Tags).toContainEqual({ Key: 'System', Value: 'shared' });
    expect(Object.values(resources(dual, 'EIP')).map(r => r.Properties.Tags.find((tag: any) => tag.Key === 'System').Value).sort()).toEqual(['amneziawg', 'xray']);
    expect(Object.values(dual.Resources).some((r: any) => /AWS::(?:IAM|ECR|ECS|Lambda|S3)::/.test(r.Type))).toBe(false);
  });
});
