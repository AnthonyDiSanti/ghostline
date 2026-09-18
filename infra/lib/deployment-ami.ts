type AmiMetadata = Partial<Record<'State' | 'ImageOwnerAlias' | 'Architecture' | 'RootDeviceName' | 'RootDeviceType' | 'VirtualizationType' | 'Name', string>>;

export function assertDeploymentAmi(image: AmiMetadata | undefined): void {
  // AWS uses regional publisher accounts; the API owner alias verifies Amazon without hardcoding one region.
  if (!image || image.State !== 'available' || image.ImageOwnerAlias !== 'amazon' || image.Architecture !== 'arm64'
    || image.RootDeviceName !== '/dev/xvda' || !image.Name?.startsWith('al2023-ami-ecs-hvm-')) {
    throw new Error('Pinned AMI is not an available AWS AL2023 ECS ARM64 image.');
  }
}
