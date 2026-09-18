// Advertised EC2 memory, checked against AWS during preflight; never infer capacity from a size suffix.
const instanceMemoryMiB: Record<string, number> = Object.fromEntries(
  Object.entries({ nano: 512, micro: 1024, small: 2048, medium: 4096, large: 8192, xlarge: 16384, '2xlarge': 32768 })
    .map(([size, memory]) => [`t4g.${size}`, memory]),
);

export function ecsMemoryBudget(instanceType: string) {
  const advertised = instanceMemoryMiB[instanceType];
  if (!advertised) throw new Error('Unsupported ECS instance memory capacity.');
  // Withhold platform loss once: ECS already registers OS-visible, not advertised, memory.
  const platform = 256;
  const baseline = Math.ceil(Math.max(512, advertised * 0.10));
  const task = Math.floor(advertised - (platform + baseline) * 1.20);
  if (task < 512) throw new Error('ECS gateway memory budget is below 512 MiB.');
  return { advertised, platform, baseline, task, reserved: advertised - platform - task };
}

export function assertInstanceMemory(instanceType: string, actual: number | undefined): void {
  // Fail before deployment if the offline capacity fact differs from the selected AWS type.
  if (ecsMemoryBudget(instanceType).advertised !== actual) throw new Error('AWS instance memory differs from the offline capacity fact.');
}
