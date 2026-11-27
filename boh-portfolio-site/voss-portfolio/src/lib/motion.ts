export interface DeviceProfile {
  prefersReducedMotion: boolean;
  saved?: boolean;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

export function resolveMotionEnabled(profile: DeviceProfile): boolean {
  if (profile.prefersReducedMotion) return false;
  if (profile.saved !== undefined) return profile.saved;
  const lowMemory = profile.deviceMemory !== undefined && profile.deviceMemory <= 4;
  const lowCpu = profile.hardwareConcurrency !== undefined && profile.hardwareConcurrency <= 4;
  return !lowMemory && !lowCpu;
}
