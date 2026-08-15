import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks & env — evaluated before the module under test is imported
// ---------------------------------------------------------------------------
const {
  hoistedSupabase,
  hoistedFetch,
  hoistedGuard
} = vi.hoisted(() => {
  vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', 'mycloud');
  vi.stubEnv('VITE_CLOUDINARY_DELIVERY_BASE_URL', 'https://cdn.example.com');
  vi.stubEnv('VITE_CLOUDINARY_UPLOAD_BASE_URL', 'https://api.example.com');
  vi.stubEnv('VITE_CLOUDINARY_CLOUD_PLUS_UPLOAD_PRESET', 'cloud_plus_preset');

  // ---- supabase spies ----------------------------------------------------
  const fromChain = {
    upsert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn()
  };

  fromChain.upsert.mockResolvedValue({ error: null });
fromChain.eq.mockReturnValue(fromChain);
fromChain.in.mockReturnValue(fromChain);
fromChain.is.mockResolvedValue({ error: null });
fromChain.update.mockReturnValue(fromChain);

  const hoistedSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null })
    },
    from: vi.fn().mockReturnValue(fromChain),
    rpc: vi.fn().mockResolvedValue({ error: null }),
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: { ok: true, deleted: ['img1'], failed: [] },
        error: null
      })
    }
  };

  // ---- fetch spy ----------------------------------------------------------
  const hoistedFetch = vi.fn();

  // ---- cloud-upload-guard spies -------------------------------------------
  const hoistedGuard = {
    validateCloudinaryUploadResult: vi.fn(),
    validateImageFileBeforeUpload: vi.fn().mockResolvedValue(undefined),
    CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES: 10 * 1024 * 1024
  };

  return { hoistedSupabase, hoistedFetch, hoistedGuard };
});

// ---------------------------------------------------------------------------
// Dependency mocks
// ---------------------------------------------------------------------------
vi.mock('../../src/utils/supabase-client.js', () => ({
  supabase: hoistedSupabase
}));

vi.mock('../../src/utils/cloud-upload-guard.js', async () => {
  const actual = await vi.importActual('../../src/utils/cloud-upload-guard.js');
  return {
    ...actual,
    validateCloudinaryUploadResult: hoistedGuard.validateCloudinaryUploadResult,
    validateImageFileBeforeUpload: hoistedGuard.validateImageFileBeforeUpload
  };
});

vi.mock('../../src/utils/request-core.js', async () => {
  const actual = await vi.importActual('../../src/utils/request-core.js');
  return actual;
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------
import {
  isCloudinaryNoteUploadConfigured,
  supportsCloudinaryClientDeleteToken,
  getCloudinaryDisplayUrl,
  getCloudinaryTransformedUrl,
  extractCloudinaryPublicIdFromUrl,
  registerCloudinaryPendingUpload,
  markCloudinaryUploadsClaimed,
  assertCloudinaryUploadAllowed,
  uploadImageToCloudinary,
  deleteCloudinaryAssetByToken,
  deleteCloudinaryAssetsByPublicIds,
  CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES
} from '../../src/utils/cloudinary-client.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('cloudinary-client', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    hoistedSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-abc' } }, error: null });
    hoistedSupabase.rpc.mockResolvedValue({ error: null });
    hoistedSupabase.functions.invoke.mockResolvedValue({
      data: { ok: true, deleted: ['img1'], failed: [] },
      error: null
    });

    const chain = hoistedSupabase.from();
    chain.upsert.mockResolvedValue({ error: null });
    chain.update.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.in.mockReturnValue(chain);
    chain.is.mockResolvedValue({ error: null });

    hoistedGuard.validateCloudinaryUploadResult.mockReturnValue(true);
    hoistedGuard.validateImageFileBeforeUpload.mockResolvedValue(undefined);

    hoistedFetch.mockReset();
    globalThis.fetch = hoistedFetch;

    // Clear call history from beforeEach setup (e.g. the from() call above)
    vi.clearAllMocks();
  });

  // =========================================================================
  // isCloudinaryNoteUploadConfigured
  // =========================================================================
  describe('isCloudinaryNoteUploadConfigured', () => {
    it('returns true when both CLOUDINARY_CLOUD_NAME and DEFAULT_UPLOAD_PRESET are set', () => {
      expect(isCloudinaryNoteUploadConfigured()).toBe(true);
    });

    it('falls back to built-in cloud name and preset when env is empty', async () => {
      vi.stubEnv('VITE_CLOUDINARY_CLOUD_NAME', '');
      vi.stubEnv('VITE_CLOUDINARY_CLOUD_PLUS_UPLOAD_PRESET', '');
      vi.stubEnv('VITE_CLOUDINARY_NOTE_UPLOAD_PRESET', '');
      vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', '');

      const mod = await import('../../src/utils/cloudinary-client.js?update=' + Date.now());
      // 模块内置生产兜底（cloud name + preset），env 缺失时仍视为已配置
      expect(mod.isCloudinaryNoteUploadConfigured()).toBe(true);
    });
  });

  // =========================================================================
  // supportsCloudinaryClientDeleteToken
  // =========================================================================
  describe('supportsCloudinaryClientDeleteToken', () => {
    it('returns true when payload has delete_token', () => {
      expect(supportsCloudinaryClientDeleteToken({ delete_token: 'tok123' })).toBe(true);
    });

    it('returns true when payload has deleteToken (camelCase)', () => {
      expect(supportsCloudinaryClientDeleteToken({ deleteToken: 'tok456' })).toBe(true);
    });

    it('returns false when payload has neither', () => {
      expect(supportsCloudinaryClientDeleteToken({ public_id: 'img1' })).toBe(false);
    });

    it('returns false for empty payload', () => {
      expect(supportsCloudinaryClientDeleteToken({})).toBe(false);
    });

    it('returns false for null/undefined payload', () => {
      expect(supportsCloudinaryClientDeleteToken(null)).toBe(false);
      expect(supportsCloudinaryClientDeleteToken(undefined)).toBe(false);
    });

    it('returns false for empty string token', () => {
      expect(supportsCloudinaryClientDeleteToken({ delete_token: '' })).toBe(false);
      expect(supportsCloudinaryClientDeleteToken({ deleteToken: '  ' })).toBe(false);
    });

    it('returns false for non-object payloads', () => {
      expect(supportsCloudinaryClientDeleteToken('string')).toBe(false);
      expect(supportsCloudinaryClientDeleteToken(123)).toBe(false);
    });
  });

  // =========================================================================
  // getCloudinaryDisplayUrl
  // =========================================================================
  describe('getCloudinaryDisplayUrl', () => {
    const deliveryOrigin = 'https://cdn.example.com';

    it('rewrites res.cloudinary.com URL to delivery base', () => {
      const input = 'https://res.cloudinary.com/mycloud/image/upload/v123/photo.jpg';
      const expected = `${deliveryOrigin}/mycloud/image/upload/v123/photo.jpg`;
      expect(getCloudinaryDisplayUrl(input)).toBe(expected);
    });

    it('preserves query parameters', () => {
      const input = 'https://res.cloudinary.com/mycloud/image/upload/v123/photo.jpg?w=800';
      const expected = `${deliveryOrigin}/mycloud/image/upload/v123/photo.jpg?w=800`;
      expect(getCloudinaryDisplayUrl(input)).toBe(expected);
    });

    it('returns input unchanged for non-Cloudinary URLs', () => {
      const input = 'https://example.com/photo.jpg';
      expect(getCloudinaryDisplayUrl(input)).toBe(input);
    });

    it('returns input unchanged for non-https URLs', () => {
      const input = 'http://res.cloudinary.com/mycloud/image/upload/v123/photo.jpg';
      expect(getCloudinaryDisplayUrl(input)).toBe(input);
    });

    it('returns input unchanged for empty input', () => {
      expect(getCloudinaryDisplayUrl('')).toBe('');
    });

    it('returns input unchanged for null/undefined input', () => {
      expect(getCloudinaryDisplayUrl(null)).toBe('');
      expect(getCloudinaryDisplayUrl(undefined)).toBe('');
    });

    it('falls back to built-in delivery base when env is empty', async () => {
      vi.stubEnv('VITE_CLOUDINARY_DELIVERY_BASE_URL', '');
      const mod = await import('../../src/utils/cloudinary-client.js?update=' + Date.now());
      const input = 'https://res.cloudinary.com/mycloud/image/upload/v123/photo.jpg';
      // 模块内置生产 CDN 兜底，env 缺失时仍重写 delivery 地址
      expect(mod.getCloudinaryDisplayUrl(input)).toBe('https://cdn.blockofhome.cn/mycloud/image/upload/v123/photo.jpg');
    });

    it('returns input unchanged for invalid URL string', () => {
      expect(getCloudinaryDisplayUrl('not-a-url')).toBe('not-a-url');
    });
  });

  // =========================================================================
  // getCloudinaryTransformedUrl
  // =========================================================================
  describe('getCloudinaryTransformedUrl', () => {
    const deliveryOrigin = 'https://cdn.example.com';

    it('inserts transformation into Cloudinary URL', () => {
      const input = 'https://res.cloudinary.com/mycloud/image/upload/v123/photo.jpg';
      const result = getCloudinaryTransformedUrl(input, 'w_400,h_300,c_fill');
      expect(result).toBe(`${deliveryOrigin}/mycloud/image/upload/w_400,h_300,c_fill/v123/photo.jpg`);
    });

    it('strips leading/trailing slashes from transformation', () => {
      const input = 'https://res.cloudinary.com/mycloud/image/upload/v123/photo.jpg';
      const result = getCloudinaryTransformedUrl(input, '/w_400/');
      expect(result).toBe(`${deliveryOrigin}/mycloud/image/upload/w_400/v123/photo.jpg`);
    });

    it('skips transformation if it already exists in the URL', () => {
      const input = 'https://res.cloudinary.com/mycloud/image/upload/w_400/v123/photo.jpg';
      const result = getCloudinaryTransformedUrl(input, 'w_400');
      // Should just rewrite to delivery URL without double-inserting
      expect(result).toBe(`${deliveryOrigin}/mycloud/image/upload/w_400/v123/photo.jpg`);
    });

    it('returns delivery URL when transformation is empty', () => {
      const input = 'https://res.cloudinary.com/mycloud/image/upload/v123/photo.jpg';
      const result = getCloudinaryTransformedUrl(input, '');
      expect(result).toBe(`${deliveryOrigin}/mycloud/image/upload/v123/photo.jpg`);
    });

    it('returns delivery URL when transformation is only whitespace', () => {
      const input = 'https://res.cloudinary.com/mycloud/image/upload/v123/photo.jpg';
      const result = getCloudinaryTransformedUrl(input, '   ');
      expect(result).toBe(`${deliveryOrigin}/mycloud/image/upload/v123/photo.jpg`);
    });

    it('returns delivery URL when input is empty', () => {
      const result = getCloudinaryTransformedUrl('', 'w_400');
      expect(result).toBe('');
    });

    it('returns delivery URL for non-Cloudinary URLs', () => {
      const input = 'https://example.com/photo.jpg';
      const result = getCloudinaryTransformedUrl(input, 'w_400');
      expect(result).toBe(getCloudinaryDisplayUrl(input));
    });

    it('handles URL without /image/upload/ marker gracefully', () => {
      const input = 'https://res.cloudinary.com/mycloud/raw/upload/v123/file.pdf';
      const result = getCloudinaryTransformedUrl(input, 'w_400');
      expect(result).toBe(getCloudinaryDisplayUrl(input));
    });

    it('returns input unchanged for invalid URL string', () => {
      expect(getCloudinaryTransformedUrl('not-a-url', 'w_400')).toBe('not-a-url');
    });
  });

  // =========================================================================
  // extractCloudinaryPublicIdFromUrl
  // =========================================================================
  describe('extractCloudinaryPublicIdFromUrl', () => {
    it('extracts public_id from standard Cloudinary URL', () => {
      const url = 'https://res.cloudinary.com/mycloud/image/upload/v1234567890/folder/photo.jpg';
      expect(extractCloudinaryPublicIdFromUrl(url)).toBe('folder/photo');
    });

    it('extracts public_id without version segment', () => {
      const url = 'https://res.cloudinary.com/mycloud/image/upload/folder/photo.jpg';
      expect(extractCloudinaryPublicIdFromUrl(url)).toBe('folder/photo');
    });

    it('extracts public_id with nested folders', () => {
      const url = 'https://res.cloudinary.com/mycloud/image/upload/v1/a/b/c/photo.jpg';
      expect(extractCloudinaryPublicIdFromUrl(url)).toBe('a/b/c/photo');
    });

    it('returns empty string for empty input', () => {
      expect(extractCloudinaryPublicIdFromUrl('')).toBe('');
    });

    it('returns empty string for null/undefined input', () => {
      expect(extractCloudinaryPublicIdFromUrl(null)).toBe('');
      expect(extractCloudinaryPublicIdFromUrl(undefined)).toBe('');
    });

    it('returns empty string for URL without upload segment', () => {
      expect(extractCloudinaryPublicIdFromUrl('https://res.cloudinary.com/mycloud/image/fetch/photo.jpg')).toBe('');
    });

    it('returns empty string for non-Cloudinary URLs', () => {
      expect(extractCloudinaryPublicIdFromUrl('https://example.com/photo.jpg')).toBe('');
    });

    it('returns empty string for invalid URL string', () => {
      expect(extractCloudinaryPublicIdFromUrl('not-a-url')).toBe('');
    });

    it('strips file extension from public_id', () => {
      const url = 'https://res.cloudinary.com/mycloud/image/upload/photo.webp';
      expect(extractCloudinaryPublicIdFromUrl(url)).toBe('photo');
    });

    it('handles URL with version and no extension', () => {
      const url = 'https://res.cloudinary.com/mycloud/image/upload/v123/folder/photo';
      expect(extractCloudinaryPublicIdFromUrl(url)).toBe('folder/photo');
    });

    it('skips version segments (vN format)', () => {
      const url = 'https://res.cloudinary.com/mycloud/image/upload/v123/v456/photo.jpg';
      // v456 is skipped because it matches /^v\d+$/
      expect(extractCloudinaryPublicIdFromUrl(url)).toBe('photo');
    });
  });

  // =========================================================================
  // registerCloudinaryPendingUpload
  // =========================================================================
  describe('registerCloudinaryPendingUpload', () => {
    const uploaded = {
      publicId: 'folder/img1',
      url: 'https://res.cloudinary.com/mycloud/image/upload/v123/folder/img1.jpg',
      secure_url: 'https://res.cloudinary.com/mycloud/image/upload/v123/folder/img1.jpg'
    };

    it('registers a pending upload successfully', async () => {
      const result = await registerCloudinaryPendingUpload(uploaded, { source: 'forum' });
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(false);
      expect(result.error).toBeNull();
      expect(hoistedSupabase.from).toHaveBeenCalledWith('cloudinary_pending_uploads');
      expect(hoistedSupabase.from().upsert).toHaveBeenCalled();
    });

    it('skips when uploaded has no publicId', async () => {
      const result = await registerCloudinaryPendingUpload({ url: 'https://example.com/img.jpg' });
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('skips when userId is not available (not authenticated)', async () => {
      hoistedSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      const result = await registerCloudinaryPendingUpload(uploaded);
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('supports snake_case public_id field', async () => {
      const result = await registerCloudinaryPendingUpload(
        { public_id: 'folder/img2', url: 'https://example.com/img2.jpg' },
        { source: 'note' }
      );
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(false);
    });

    it('handles missing pending upload table gracefully', async () => {
      const chain = hoistedSupabase.from();
      chain.upsert.mockResolvedValueOnce({
        error: { code: '42P01', message: 'could not find the table' }
      });

      const result = await registerCloudinaryPendingUpload(uploaded);
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('handles PGRST202 error gracefully', async () => {
      const chain = hoistedSupabase.from();
      chain.upsert.mockResolvedValueOnce({
        error: { code: 'PGRST202', message: 'relation not found' }
      });

      const result = await registerCloudinaryPendingUpload(uploaded);
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('returns error for non-missing-table errors', async () => {
      const chain = hoistedSupabase.from();
      chain.upsert.mockResolvedValueOnce({
        error: { code: '23505', message: 'duplicate key' }
      });

      const result = await registerCloudinaryPendingUpload(uploaded);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // =========================================================================
  // markCloudinaryUploadsClaimed
  // =========================================================================
  describe('markCloudinaryUploadsClaimed', () => {
    it('marks uploads as claimed', async () => {
      const result = await markCloudinaryUploadsClaimed(['folder/img1', 'folder/img2']);
      expect(result.ok).toBe(true);
      expect(result.error).toBeNull();
      expect(hoistedSupabase.from).toHaveBeenCalledWith('cloudinary_pending_uploads');
    });

    it('skips when publicIds array is empty', async () => {
      const result = await markCloudinaryUploadsClaimed([]);
      expect(result.ok).toBe(true);
      expect(result.error).toBeNull();
      expect(hoistedSupabase.from).not.toHaveBeenCalled();
    });

    it('normalizes publicIds (deduplicates and filters empty)', async () => {
      const result = await markCloudinaryUploadsClaimed(['a', 'a', '', 'b']);
      expect(result.ok).toBe(true);

      const chain = hoistedSupabase.from();
      expect(chain.in).toHaveBeenCalledWith('public_id', ['a', 'b']);
    });

    it('normalizes object-format publicIds', async () => {
      const result = await markCloudinaryUploadsClaimed([
        { publicId: 'a' },
        { public_id: 'b' },
        'c'
      ]);
      expect(result.ok).toBe(true);

      const chain = hoistedSupabase.from();
      expect(chain.in).toHaveBeenCalledWith('public_id', ['a', 'b', 'c']);
    });

    it('returns error when user is not authenticated', async () => {
      hoistedSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      const result = await markCloudinaryUploadsClaimed(['img1']);
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('handles missing table error gracefully', async () => {
      const chain = hoistedSupabase.from();
      chain.is.mockResolvedValueOnce({
        error: { code: '42P01', message: 'could not find the table' }
      });

      const result = await markCloudinaryUploadsClaimed(['img1']);
      expect(result.ok).toBe(true);
    });
  });

  // =========================================================================
  // assertCloudinaryUploadAllowed
  // =========================================================================
  describe('assertCloudinaryUploadAllowed', () => {
    it('resolves when rate limiting is not triggered', async () => {
      await expect(assertCloudinaryUploadAllowed({ source: 'forum' })).resolves.toBeUndefined();
      expect(hoistedSupabase.rpc).toHaveBeenCalledWith('assert_cloudinary_upload_allowed', {
        p_source: 'forum'
      });
    });

    it('skips check when user is not authenticated', async () => {
      hoistedSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
      await expect(assertCloudinaryUploadAllowed()).resolves.toBeUndefined();
      expect(hoistedSupabase.rpc).not.toHaveBeenCalled();
    });

    it('silently ignores missing function error (PGRST202)', async () => {
      hoistedSupabase.rpc.mockResolvedValueOnce({
        error: { code: 'PGRST202', message: 'could not find the function' }
      });
      await expect(assertCloudinaryUploadAllowed()).resolves.toBeUndefined();
    });

    it('throws for rate-limit errors', async () => {
      hoistedSupabase.rpc.mockResolvedValueOnce({
        error: { code: 'RATE_LIMITED', message: 'too many uploads' }
      });
      await expect(assertCloudinaryUploadAllowed()).rejects.toThrow();
    });

    it('defaults source to generic when not provided', async () => {
      await assertCloudinaryUploadAllowed();
      expect(hoistedSupabase.rpc).toHaveBeenCalledWith('assert_cloudinary_upload_allowed', {
        p_source: 'generic'
      });
    });
  });

  // =========================================================================
  // uploadImageToCloudinary
  // =========================================================================
  describe('uploadImageToCloudinary', () => {
    const fakeFile = new Blob(['fake-image-data'], { type: 'image/png' });
    fakeFile.name = 'test.png';

    beforeEach(() => {
      hoistedFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          secure_url: 'https://res.cloudinary.com/mycloud/image/upload/v123/boh-cloud-plus/test.png',
          public_id: 'boh-cloud-plus/test',
          delete_token: 'del-tok-123',
          width: 800,
          height: 600,
          format: 'png',
          original_filename: 'test.png'
        })
      });
    });

    it('uploads an image successfully', async () => {
      const result = await uploadImageToCloudinary(fakeFile, {
        uploadPreset: 'my_preset',
        folder: 'boh-cloud-plus',
        skipUploadPreflight: true
      });

      expect(result.url).toBe('https://res.cloudinary.com/mycloud/image/upload/v123/boh-cloud-plus/test.png');
      expect(result.publicId).toBe('boh-cloud-plus/test');
      expect(result.deleteToken).toBe('del-tok-123');
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
      expect(result.format).toBe('png');
      expect(result.originalFilename).toBe('test');

      expect(hoistedFetch).toHaveBeenCalledTimes(1);
      const [fetchUrl, fetchOptions] = hoistedFetch.mock.calls[0];
      expect(fetchUrl).toContain('/v1_1/mycloud/image/upload');
      expect(fetchOptions.body).toBeInstanceOf(FormData);
    });

    it('uses DEFAULT_UPLOAD_PRESET when no preset provided', async () => {
      const result = await uploadImageToCloudinary(fakeFile, { skipUploadPreflight: true });

      expect(result.publicId).toBe('boh-cloud-plus/test');
      // DEFAULT_UPLOAD_PRESET is 'cloud_plus_preset'
    });

    it('validates image file before upload', async () => {
      await uploadImageToCloudinary(fakeFile, { skipUploadPreflight: true });
      expect(hoistedGuard.validateImageFileBeforeUpload).toHaveBeenCalledWith(fakeFile);
    });

    it('throws when image validation fails', async () => {
      hoistedGuard.validateImageFileBeforeUpload.mockRejectedValueOnce(new Error('图片文件头异常'));
      await expect(uploadImageToCloudinary(fakeFile)).rejects.toThrow('图片文件头异常');
    });

    it('uses built-in preset fallback when env is empty', async () => {
      vi.stubEnv('VITE_CLOUDINARY_CLOUD_PLUS_UPLOAD_PRESET', '');
      vi.stubEnv('VITE_CLOUDINARY_NOTE_UPLOAD_PRESET', '');
      vi.stubEnv('VITE_CLOUDINARY_UPLOAD_PRESET', '');

      const mod = await import('../../src/utils/cloudinary-client.js?update=' + Date.now());
      // 模块内置 'BOHIMG' preset 兜底：env 缺失时上传仍可进行
      const result = await mod.uploadImageToCloudinary(fakeFile, { skipUploadPreflight: true });
      expect(result.publicId).toBe('boh-cloud-plus/test');
      const [, fetchOptions] = hoistedFetch.mock.calls[0];
      expect(fetchOptions.body.get('upload_preset')).toBe('BOHIMG');
    });

    it('runs upload preflight (rate limiting) by default', async () => {
      hoistedSupabase.rpc.mockResolvedValue({ error: null });

      await uploadImageToCloudinary(fakeFile);

      expect(hoistedSupabase.rpc).toHaveBeenCalledWith('assert_cloudinary_upload_allowed', {
        p_source: 'generic'
      });
    });

    it('skips preflight when skipUploadPreflight is true', async () => {
      await uploadImageToCloudinary(fakeFile, { skipUploadPreflight: true });
      expect(hoistedSupabase.rpc).not.toHaveBeenCalled();
    });

    it('validates Cloudinary upload result', async () => {
      await uploadImageToCloudinary(fakeFile, { skipUploadPreflight: true });
      expect(hoistedGuard.validateCloudinaryUploadResult).toHaveBeenCalled();
    });

    it('registers pending upload when pendingSource is provided', async () => {
      const result = await uploadImageToCloudinary(fakeFile, {
        skipUploadPreflight: true,
        pendingSource: 'forum',
        registerPendingUpload: true
      });

      expect(result.publicId).toBe('boh-cloud-plus/test');
      expect(hoistedSupabase.from).toHaveBeenCalledWith('cloudinary_pending_uploads');
    });

    it('does not register pending upload when registerPendingUpload is false', async () => {
      await uploadImageToCloudinary(fakeFile, {
        skipUploadPreflight: true,
        pendingSource: 'forum',
        registerPendingUpload: false
      });

      expect(hoistedSupabase.from).not.toHaveBeenCalled();
    });

    it('does not register pending upload when pendingSource is empty', async () => {
      await uploadImageToCloudinary(fakeFile, {
        skipUploadPreflight: true,
        pendingSource: ''
      });

      expect(hoistedSupabase.from).not.toHaveBeenCalled();
    });

    it('throws when Cloudinary returns an error response', async () => {
      hoistedFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({
          error: { message: 'Upload rejected' }
        })
      });

      await expect(
        uploadImageToCloudinary(fakeFile, { skipUploadPreflight: true })
      ).rejects.toThrow('Upload rejected');
    });

    it('throws when Cloudinary returns non-ok with no error message', async () => {
      hoistedFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({})
      });

      await expect(
        uploadImageToCloudinary(fakeFile, { skipUploadPreflight: true })
      ).rejects.toThrow('Cloudinary 上传失败');
    });

    it('throws when pending upload registration fails', async () => {
      const chain = hoistedSupabase.from();
      chain.upsert.mockResolvedValueOnce({
        error: { code: 'SOME_ERROR', message: 'db error' }
      });

      await expect(
        uploadImageToCloudinary(fakeFile, {
          skipUploadPreflight: true,
          pendingSource: 'forum'
        })
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // deleteCloudinaryAssetByToken
  // =========================================================================
  describe('deleteCloudinaryAssetByToken', () => {
    beforeEach(() => {
      hoistedFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: 'ok', partial: false })
      });
    });

    it('deletes asset by token successfully', async () => {
      const result = await deleteCloudinaryAssetByToken('del-tok-123');

      expect(result.ok).toBe(true);
      expect(result.result).toBe('ok');
      expect(result.partial).toBe(false);
      expect(hoistedFetch).toHaveBeenCalledTimes(1);
      expect(hoistedFetch.mock.calls[0][0]).toContain('/delete_by_token');
    });

    it('throws when deleteToken is empty', async () => {
      await expect(deleteCloudinaryAssetByToken('')).rejects.toThrow('缺少 Cloudinary delete token');
      await expect(deleteCloudinaryAssetByToken(null)).rejects.toThrow('缺少 Cloudinary delete token');
    });

    it('throws when Cloudinary returns error', async () => {
      hoistedFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Token expired' } })
      });

      await expect(deleteCloudinaryAssetByToken('bad-token')).rejects.toThrow('Token expired');
    });

    it('passes keepalive option through', async () => {
      await deleteCloudinaryAssetByToken('tok', { keepalive: true });

      expect(hoistedFetch.mock.calls[0][1].keepalive).toBe(true);
    });
  });

  // =========================================================================
  // deleteCloudinaryAssetsByPublicIds
  // =========================================================================
  describe('deleteCloudinaryAssetsByPublicIds', () => {
    it('deletes assets by publicIds via Supabase function', async () => {
      hoistedSupabase.functions.invoke.mockResolvedValueOnce({
        data: { ok: true, deleted: ['img1', 'img2'], failed: [] },
        error: null
      });

      const result = await deleteCloudinaryAssetsByPublicIds(['img1', 'img2']);

      expect(result.ok).toBe(true);
      expect(result.data.deleted).toEqual(['img1', 'img2']);
      expect(result.error).toBeNull();
      expect(hoistedSupabase.functions.invoke).toHaveBeenCalledWith('cloudinary-delete', {
        body: {
          publicIds: ['img1', 'img2'],
          resourceType: 'image'
        }
      });
    });

    it('deduplicates publicIds', async () => {
      await deleteCloudinaryAssetsByPublicIds(['a', 'b', 'a']);

      expect(hoistedSupabase.functions.invoke).toHaveBeenCalledWith('cloudinary-delete', {
        body: {
          publicIds: ['a', 'b'],
          resourceType: 'image'
        }
      });
    });

    it('returns early for empty publicIds', async () => {
      const result = await deleteCloudinaryAssetsByPublicIds([]);

      expect(result.ok).toBe(true);
      expect(result.data.deleted).toEqual([]);
      expect(hoistedSupabase.functions.invoke).not.toHaveBeenCalled();
    });

    it('filters falsy values from publicIds', async () => {
      await deleteCloudinaryAssetsByPublicIds(['a', '', null, undefined, 'b']);

      expect(hoistedSupabase.functions.invoke).toHaveBeenCalledWith('cloudinary-delete', {
        body: {
          publicIds: ['a', 'b'],
          resourceType: 'image'
        }
      });
    });

    it('handles Supabase function error', async () => {
      hoistedSupabase.functions.invoke.mockResolvedValueOnce({
        data: null,
        error: { message: 'Function error', code: 'FUNC_ERR' }
      });

      const result = await deleteCloudinaryAssetsByPublicIds(['img1']);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns error when Supabase function reports failure', async () => {
      hoistedSupabase.functions.invoke.mockResolvedValueOnce({
        data: { ok: false, message: 'Partial failure', code: 'PARTIAL' },
        error: null
      });

      const result = await deleteCloudinaryAssetsByPublicIds(['img1']);

      expect(result.ok).toBe(false);
    });

    it('supports non-default resourceType', async () => {
      await deleteCloudinaryAssetsByPublicIds(['vid1'], { resourceType: 'video' });

      expect(hoistedSupabase.functions.invoke).toHaveBeenCalledWith('cloudinary-delete', {
        body: {
          publicIds: ['vid1'],
          resourceType: 'video'
        }
      });
    });
  });

  // =========================================================================
  // Exported constant
  // =========================================================================
  describe('CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES', () => {
    it('exports the max image size constant from cloud-upload-guard', () => {
      expect(CLOUD_UPLOAD_MAX_IMAGE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    });
  });
});