/**
 * 云服务状态查询 API
 * 
 * 支持获取 Cloudinary 和 Supabase 的使用状态
 * 
 * 注意：部分数据需要后端 Edge Function 或 RPC 获取，
 * 因为涉及 API Secret / Service Role Key
 */

import { supabase } from './supabase-client.js';
import { logger } from './logger.js';

const CLOUDINARY_CLOUD_NAME = String(import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dkqae7j1m').trim();

/**
 * 获取 Cloudinary 使用情况
 * 
 * Cloudinary Admin API 需要 API Key + Secret，
 * 这里通过 Supabase Edge Function 代理调用
 * 
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export async function getCloudinaryUsageStatus() {
  try {
    // 尝试调用 Edge Function 获取 Cloudinary 使用情况
    const { data, error } = await supabase.functions.invoke('cloudinary-usage', {
      body: { cloudName: CLOUDINARY_CLOUD_NAME }
    });

    if (error) {
      // 如果 Edge Function 不存在，返回基本信息
      if (String(error.message || '').toLowerCase().includes('not found') ||
        String(error.code || '').toUpperCase() === 'PGRST202') {
        logger.warn('cloud-status', 'Cloudinary usage Edge Function 尚未部署');
        return {
          ok: true,
          data: {
            configured: Boolean(CLOUDINARY_CLOUD_NAME),
            cloudName: CLOUDINARY_CLOUD_NAME,
            deploymentRequired: true,
            message: '需部署 cloudinary-usage Edge Function 以获取详细使用情况'
          }
        };
      }
      throw error;
    }

    return {
      ok: Boolean(data?.ok),
      data: {
        configured: true,
        cloudName: CLOUDINARY_CLOUD_NAME,
        // Cloudinary usage 数据结构
        bandwidth: data?.bandwidth || 0,
        bandwidthLimit: data?.bandwidth_limit || 0,
        storage: data?.storage || 0,
        storageLimit: data?.storage_limit || 0,
        credits: data?.credits || 0,
        creditsLimit: data?.credits_limit || 0,
        lastUpdated: data?.last_updated || new Date().toISOString(),
        // 计算百分比
        bandwidthPercent: data?.bandwidth_limit > 0 ? Math.round((data?.bandwidth / data?.bandwidth_limit) * 100) : 0,
        storagePercent: data?.storage_limit > 0 ? Math.round((data?.storage / data?.storage_limit) * 100) : 0,
        creditsPercent: data?.credits_limit > 0 ? Math.round((data?.credits / data?.credits_limit) * 100) : 0
      }
    };
  } catch (error) {
    logger.warn('cloud-status', '获取 Cloudinary 状态失败:', error);
    return {
      ok: false,
      error: String(error?.message || '获取 Cloudinary 状态失败')
    };
  }
}

/**
 * 获取 Supabase 项目状态
 * 
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export async function getSupabaseProjectStatus() {
  try {
    // 尝试通过 RPC 获取项目状态
    const { data: rpcData, error: rpcError } = await supabase.rpc('admin_supabase_project_status');

    if (!rpcError && rpcData?.ok) {
      return {
        ok: true,
        data: {
          projectName: rpcData?.project_name || 'BOHLITE',
          region: rpcData?.region || 'ap-northeast-1',
          databaseSize: rpcData?.database_size || 0,
          databaseSizeLimit: rpcData?.database_size_limit || 0,
          storageSize: rpcData?.storage_size || 0,
          storageSizeLimit: rpcData?.storage_size_limit || 0,
          activeConnections: rpcData?.active_connections || 0,
          monthlyActiveUsers: rpcData?.monthly_active_users || 0,
          apiRequestsMonth: rpcData?.api_requests_month || 0,
          edgeFunctionCount: rpcData?.edge_function_count || 0,
          // 计算百分比
          databasePercent: rpcData?.database_size_limit > 0 
            ? Math.round((rpcData?.database_size / rpcData?.database_size_limit) * 100) : 0,
          storagePercent: rpcData?.storage_size_limit > 0 
            ? Math.round((rpcData?.storage_size / rpcData?.storage_size_limit) * 100) : 0,
          healthScore: calculateSupabaseHealthScore(rpcData),
          lastUpdated: new Date().toISOString()
        }
      };
    }

    // RPC 不存在时的备用方案：通过基础查询估算状态
    if (rpcError && String(rpcError.code || '').toUpperCase() === 'PGRST202') {
      logger.warn('cloud-status', 'Supabase status RPC 尚未部署，使用估算值');
      
      // 获取基础数据用于估算
      const { count: userCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      
      const { count: postCount } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true });

      return {
        ok: true,
        data: {
          projectName: 'BOHLITE',
          deploymentRequired: true,
          message: '需部署 admin_supabase_project_status RPC 以获取详细状态',
          estimatedUsers: userCount || 0,
          estimatedPosts: postCount || 0,
          healthScore: 100, // 默认健康
          lastUpdated: new Date().toISOString()
        }
      };
    }

    throw rpcError;
  } catch (error) {
    logger.warn('cloud-status', '获取 Supabase 状态失败:', error);
    return {
      ok: false,
      error: String(error?.message || '获取 Supabase 状态失败')
    };
  }
}

/**
 * 计算 Supabase 健康评分
 */
function calculateSupabaseHealthScore(data) {
  if (!data) return 100;
  
  let score = 100;
  
  // 数据库使用率扣分
  const dbPercent = data.database_size_limit > 0 
    ? (data.database_size / data.database_size_limit) * 100 : 0;
  if (dbPercent > 80) score -= 20;
  else if (dbPercent > 60) score -= 10;
  
  // 存储使用率扣分
  const storagePercent = data.storage_size_limit > 0 
    ? (data.storage_size / data.storage_size_limit) * 100 : 0;
  if (storagePercent > 80) score -= 15;
  else if (storagePercent > 60) score -= 8;
  
  // 连接数扣分
  if (data.active_connections > 50) score -= 10;
  else if (data.active_connections > 30) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * 格式化字节大小为可读字符串
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 获取所有云服务状态（并行查询）
 */
export async function getAllCloudServicesStatus() {
  const [cloudinary, supabaseStatus] = await Promise.all([
    getCloudinaryUsageStatus(),
    getSupabaseProjectStatus()
  ]);

  return {
    cloudinary,
    supabase: supabaseStatus,
    timestamp: new Date().toISOString()
  };
}