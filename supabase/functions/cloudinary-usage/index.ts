/**
 * Cloudinary 使用状态查询 Edge Function
 * 
 * 通过 Cloudinary Admin API 获取账户使用情况
 * 需要在 Supabase Dashboard 设置环境变量：
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 * - CLOUDINARY_CLOUD_NAME
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { buildCorsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.99.1';

const verifyAdmin = async (request: Request): Promise<{ ok: true; userId: string } | { ok: false; status: number; message: string }> => {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { ok: false, status: 401, message: '缺少登录凭证' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return { ok: false, status: 500, message: '服务器配置缺失' };
  }

  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data, error } = await anonClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    return { ok: false, status: 401, message: '登录状态已失效，请重新登录' };
  }

  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError || String(profile?.role || '').trim() !== 'admin') {
    return { ok: false, status: 403, message: '需要管理员权限' };
  }

  return { ok: true, userId: data.user.id };
};

serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: buildCorsHeaders(origin),
    });
  }

  try {
    // 验证管理员权限
    const authResult = await verifyAdmin(req);
    if (!authResult.ok) {
      return jsonResponse({ ok: false, error: authResult.message }, authResult.status, origin);
    }

    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME') || 'dkqae7j1m';

    if (!apiKey || !apiSecret) {
      return jsonResponse({
        ok: true, configured: false, cloud_name: cloudName,
        bandwidth: 0, bandwidth_limit: 0, storage: 0, storage_limit: 0,
        credits: 0, credits_limit: 0,
        message: '需配置 CLOUDINARY_API_KEY 和 CLOUDINARY_API_SECRET 环境变量',
        last_updated: new Date().toISOString(),
      }, 200, origin);
    }

    const basicAuth = btoa(`${apiKey}:${apiSecret}`);
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/usage`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error('cloudinary-usage: Cloudinary API 错误:', text);
      return jsonResponse({
        ok: false, error: `Cloudinary API 错误: ${response.status}`,
        details: text,
      }, 500, origin);
    }

    const u = await response.json();
    const bw = u.bandwidth?.usage ?? 0;
    const bwLimit = u.bandwidth?.limit ?? 0;
    const st = u.storage?.usage ?? 0;
    const stLimit = u.storage?.limit ?? 0;
    const cr = u.credits?.usage ?? 0;
    const crLimit = u.credits?.limit ?? 0;
    return jsonResponse({
      ok: true, configured: true, cloud_name: cloudName,
      bandwidth: bw, bandwidth_limit: bwLimit,
      bandwidth_percent: bwLimit > 0 ? Math.round((bw / bwLimit) * 100) : 0,
      storage: st, storage_limit: stLimit,
      storage_percent: stLimit > 0 ? Math.round((st / stLimit) * 100) : 0,
      credits: cr, credits_limit: crLimit,
      credits_percent: crLimit > 0 ? Math.round((cr / crLimit) * 100) : 0,
      last_updated: new Date().toISOString(),
    }, 200, origin);

  } catch (error) {
    console.error('cloudinary-usage:', error);
    return jsonResponse({
      ok: false, error: '服务器内部错误',
      details: String(error),
    }, 500, origin);
  }
});