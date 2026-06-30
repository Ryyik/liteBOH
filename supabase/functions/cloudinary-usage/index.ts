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
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { createSupabaseClient, validateAdmin } from '../_shared/auth-validation.ts';

interface CloudinaryUsageResponse {
  bandwidth: number;
  bandwidth_limit: number;
  storage: number;
  storage_limit: number;
  credits: number;
  credits_limit: number;
  last_updated: string;
}

serve(async (req: Request) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return handleCors();
  }

  try {
    // 验证管理员权限
    const supabase = createSupabaseClient(req);
    const isAdmin = await validateAdmin(supabase);
    
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ ok: false, error: '需要管理员权限' }),
        { status: 403, headers: corsHeaders }
      );
    }

    // 获取环境变量
    const apiKey = Deno.env.get('CLOUDINARY_API_KEY');
    const apiSecret = Deno.env.get('CLOUDINARY_API_SECRET');
    const cloudName = Deno.env.get('CLOUDINARY_CLOUD_NAME') || 'dkqae7j1m';

    // 如果没有配置 API Key/Secret，返回估算值
    if (!apiKey || !apiSecret) {
      console.warn('cloudinary-usage: API Key/Secret 未配置，返回估算值');
      
      // 尝试从数据库获取 pending uploads 数量
      const { count: pendingCount } = await supabase
        .from('cloudinary_pending_uploads')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null);

      return new Response(
        JSON.stringify({
          ok: true,
          configured: false,
          cloud_name: cloudName,
          bandwidth: 0,
          bandwidth_limit: 0,
          storage: 0,
          storage_limit: 0,
          credits: 0,
          credits_limit: 0,
          pending_uploads_count: pendingCount || 0,
          message: '需配置 CLOUDINARY_API_KEY 和 CLOUDINARY_API_SECRET 环境变量',
          last_updated: new Date().toISOString()
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // 调用 Cloudinary Admin API 获取使用情况
    // 参考：https://cloudinary.com/documentation/admin_api#usage_reports
    const timestamp = Math.floor(Date.now() / 1000);
    
    // 生成签名（Cloudinary API 签名规则）
    const paramsToSign = `usage&timestamp=${timestamp}`;
    const signature = await generateCloudinarySignature(paramsToSign, apiSecret);

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/usage?timestamp=${timestamp}&signature=${signature}&api_key=${apiKey}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('cloudinary-usage: Cloudinary API 错误:', errorText);
      
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Cloudinary API 错误: ${response.status}`,
          details: errorText
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    const usageData = await response.json();

    // 返回格式化的使用情况
    const result: CloudinaryUsageResponse = {
      bandwidth: usageData.bandwidth || 0,
      bandwidth_limit: usageData.bandwidth_limit || 0,
      storage: usageData.storage || 0,
      storage_limit: usageData.storage_limit || 0,
      credits: usageData.credits || usageData.api_usage || 0,
      credits_limit: usageData.credits_limit || usageData.api_rate_limit || 0,
      last_updated: new Date().toISOString()
    };

    return new Response(
      JSON.stringify({
        ok: true,
        configured: true,
        cloud_name: cloudName,
        ...result,
        bandwidth_percent: result.bandwidth_limit > 0 
          ? Math.round((result.bandwidth / result.bandwidth_limit) * 100) : 0,
        storage_percent: result.storage_limit > 0 
          ? Math.round((result.storage / result.storage_limit) * 100) : 0,
        credits_percent: result.credits_limit > 0 
          ? Math.round((result.credits / result.credits_limit) * 100) : 0
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('cloudinary-usage: 执行错误:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: '服务器内部错误',
        details: String(error)
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});

/**
 * 生成 Cloudinary API 签名
 * Cloudinary 使用 SHA-256 对参数字符串和 API Secret 进行签名
 */
async function generateCloudinarySignature(paramsToSign: string, apiSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(paramsToSign + apiSecret);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  // 转换为十六进制字符串
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}