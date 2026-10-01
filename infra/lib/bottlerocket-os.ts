export const bottlerocketOs = {
  variant: 'aws-ecs-3', architecture: 'arm64',
  latestImageParameter: '/aws/service/bottlerocket/aws-ecs-3/arm64/latest/image_id',
} as const;

export function verifyOfficialBottlerocketImage(image: { owner?: string; architecture?: string; state?: string; name?: string }, version: string): void {
  // Preflight validates AWS's selected metadata; an existing host's actual OS must still be observed independently.
  if (image.owner !== 'amazon' || image.architecture !== 'arm64' || image.state !== 'available'
    || !/^\d+\.\d+\.\d+-[a-f0-9]+$/.test(version) || image.name !== `bottlerocket-aws-ecs-3-aarch64-v${version}`) {
    throw new Error('Expected the official stable ECS-3 ARM64 Bottlerocket image.');
  }
}
