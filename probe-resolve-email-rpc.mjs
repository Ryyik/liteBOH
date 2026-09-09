// 探测远程 resolve_email_for_login 是否已修复（email 从 auth.users 取）
// 用完即删，不入库。
import { createClient } from '@supabase/supabase-js';

const url = 'https://nplnlefdwfgtyimfkyih.supabase.co';
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!key) {
  console.error('NO_ANON_KEY');
  process.exit(1);
}
const supabase = createClient(url, key);

// 用一个必然不存在的用户名调用：返回 null = 函数正常执行（已修复）；
// 报 42703 column pr.email does not exist = 还是旧函数体（未修复）。
const { data, error } = await supabase.rpc('resolve_email_for_login', { p_username: '__probe_nonexistent_user__' });
console.log('data:', JSON.stringify(data));
console.log('error:', error ? `${error.code || ''} ${error.message}` : 'null');
