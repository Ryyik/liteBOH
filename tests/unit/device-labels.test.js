import { describe, expect, it, vi } from 'vitest';

import {
  getCurrentDeviceDisplayLabel,
  formatTrustedDeviceDisplayLabel,
} from '../../src/utils/device-labels.js';

describe('device-labels: getCurrentDeviceDisplayLabel', () => {
  it('returns "当前设备" when no window', () => {
    const label = getCurrentDeviceDisplayLabel();
    expect(label).toBe('当前设备');
  });
});

describe('device-labels: formatTrustedDeviceDisplayLabel', () => {
  it('returns current device label when is_current_device', () => {
    const label = formatTrustedDeviceDisplayLabel(
      { is_current_device: true, user_agent_summary: 'Mozilla...' },
      'Mac · macOS · Chrome'
    );
    expect(label).toBe('Mac · macOS · Chrome');
  });

  it('returns "当前设备" when is_current_device and no label provided', () => {
    const label = formatTrustedDeviceDisplayLabel({ is_current_device: true });
    expect(label).toBe('当前设备');
  });

  it('parses user_agent_summary for non-current device', () => {
    const label = formatTrustedDeviceDisplayLabel(
      { is_current_device: false, user_agent_summary: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120' }
    );
    expect(label).toContain('Windows');
    expect(label).toContain('Chrome');
  });

  it('returns "未知设备" for empty summary', () => {
    const label = formatTrustedDeviceDisplayLabel(
      { is_current_device: false, user_agent_summary: '' }
    );
    expect(label).toBe('未知设备');
  });

  it('returns raw UA when no known patterns match', () => {
    // Custom UA without recognizable browser/OS patterns
    const label = formatTrustedDeviceDisplayLabel(
      { is_current_device: false, user_agent_summary: 'SomeCustomTool/1.0' }
    );
    // Should return the raw string since it can't be parsed
    expect(label).toBe('SomeCustomTool/1.0');
  });

  it('detects iPhone from label', () => {
    const label = formatTrustedDeviceDisplayLabel(
      { is_current_device: false, user_agent_summary: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)' }
    );
    expect(label).toContain('iPhone');
    expect(label).toContain('iOS');
  });

  it('detects Android from label', () => {
    const label = formatTrustedDeviceDisplayLabel(
      { is_current_device: false, user_agent_summary: 'Mozilla/5.0 (Linux; Android 13) Chrome/120' }
    );
    expect(label).toContain('Android');
    expect(label).toContain('Chrome');
  });

  it('detects Mac from label', () => {
    const label = formatTrustedDeviceDisplayLabel(
      { is_current_device: false, user_agent_summary: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605' }
    );
    expect(label).toContain('Mac');
    expect(label).toContain('macOS');
    expect(label).toContain('Safari');
  });
});