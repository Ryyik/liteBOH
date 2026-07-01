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
        // 计算百分比（-1 表示无限制）
        bandwidthPercent: calculatePercent(data?.bandwidth, data?.bandwidth_limit),
        storagePercent: calculatePercent(data?.storage, data?.storage_limit),
        creditsPercent: calculatePercent(data?.credits, data?.credits_limit),
        // 标记是否无限制
        bandwidthUnlimited: data?.bandwidth_limit === -1,
        storageUnlimited: data?.storage_limit === -1,
        creditsUnlimited: data?.credits_limit === -1
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

    // 调试日志：查看 RPC 返回结果
    logger.debug('cloud-status', 'RPC 调用结果:', { rpcData, rpcError });

    // RPC 成功返回且 ok 为 true
    if (!rpcError && rpcData?.ok) {
      logger.debug('cloud-status', 'RPC 数据成功:', rpcData);
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
          // 用户和帖子数（兼容字段名）
          user_count: rpcData?.user_count || 0,
          userCount: rpcData?.user_count || 0,
          post_count: rpcData?.post_count || 0,
          postCount: rpcData?.post_count || 0,
          // 百分比
          databasePercent: rpcData?.database_percent || (rpcData?.database_size_limit > 0
            ? Math.round((rpcData?.database_size / rpcData?.database_size_limit) * 100) : 0),
          storagePercent: rpcData?.storage_percent || (rpcData?.storage_size_limit > 0
            ? Math.round((rpcData?.storage_size / rpcData?.storage_size_limit) * 100) : 0),
          healthScore: rpcData?.health_score || calculateSupabaseHealthScore(rpcData),
          lastUpdated: new Date().toISOString()
        }
      };
    }

    // RPC 返回权限错误（ok: false）或其他错误，使用备用方案
    if (rpcError || (rpcData && !rpcData.ok)) {
      const errorMsg = rpcError?.message || rpcData?.error || '未知错误';
      logger.warn('cloud-status', 'RPC 失败，使用备用方案:', errorMsg);
    }

    // 通用备用方案：处理 RPC 未部署、权限错误、或其他错误
    logger.warn('cloud-status', '使用备用方案获取估算数据');

    // 获取基础数据用于估算
    const { count: userCount } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    const { count: postCount } = await supabase
      .from('posts')
      .select('id', { count: 'exact', head: true });

    // 估算默认值（免费计划限制）
    const defaultDbLimit = 500 * 1024 * 1024; // 500MB
    const defaultStorageLimit = 1 * 1024 * 1024 * 1024; // 1GB
    // 估算当前使用（基于记录数粗略估算）
    const estimatedDbSize = Math.min((userCount * 10 + postCount * 50) * 1024, defaultDbLimit * 0.1);
    const estimatedStorageSize = Math.min(postCount * 500 * 1024, defaultStorageLimit * 0.05);

    return {
      ok: true,
      data: {
        projectName: 'BOHLITE',
        region: 'ap-northeast-1',
        deploymentRequired: Boolean(rpcError && String(rpcError.code || '').toUpperCase() === 'PGRST202'),
        permissionError: Boolean(rpcData && !rpcData.ok && String(rpcData?.error || '').includes('权限')),
        message: rpcData?.error || '需部署 admin_supabase_project_status RPC 以获取详细状态',
        // 数据库估算
        database_size: estimatedDbSize,
        databaseSize: estimatedDbSize,
        database_size_limit: defaultDbLimit,
        databaseSizeLimit: defaultDbLimit,
        database_percent: Math.round((estimatedDbSize / defaultDbLimit) * 100),
        databasePercent: Math.round((estimatedDbSize / defaultDbLimit) * 100),
        // 存储估算
        storage_size: estimatedStorageSize,
        storageSize: estimatedStorageSize,
        storage_size_limit: defaultStorageLimit,
        storageSizeLimit: defaultStorageLimit,
        storage_percent: Math.round((estimatedStorageSize / defaultStorageLimit) * 100),
        storagePercent: Math.round((estimatedStorageSize / defaultStorageLimit) * 100),
        // 用户和帖子数（兼容多种字段名）
        user_count: userCount || 0,
        userCount: userCount || 0,
        estimatedUsers: userCount || 0,
        post_count: postCount || 0,
        postCount: postCount || 0,
        estimatedPosts: postCount || 0,
        // 其他字段默认值
        active_connections: 0,
        activeConnections: 0,
        monthly_active_users: userCount || 0,
        api_requests_month: 0,
        edge_function_count: 0,
        healthScore: 100, // 默认健康
        lastUpdated: new Date().toISOString()
      }
    };
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
 * 计算使用百分比（处理无限制和小数值情况）
 * 
 * @param {number} used 已使用量
 * @param {number} limit 总限制（-1 表示无限制）
 * @returns {number} 百分比（0-100），无限制返回 0
 */
function calculatePercent(used, limit) {
  // -1 表示无限制，返回 0
  if (limit === -1) return 0;

  // limit 为 0 或未定义时返回 0
  if (!limit || limit <= 0) return 0;

  // 计算百分比
  const percent = (used / limit) * 100;

  // 如果有使用量但百分比 < 2%，至少返回 2% 以确保进度条可见
  if (used > 0 && percent < 2) return 2;

  // 限制在 0-100 之间
  return Math.min(100, Math.max(0, Math.round(percent)));
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