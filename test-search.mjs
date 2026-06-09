// 直接 import 模块测试
import { parseFileContextTags } from '/Users/ryyik/Documents/BOHLITEForMacLatest/BOHLITEBeta2.5/src/utils/bohai-file-context.js';

console.log('1:', parseFileContextTags('搜 #search:TODO 这关键词'));
console.log('2:', parseFileContextTags('A #file:x.js B #dir:y C #search:foo D'));
console.log('3:', parseFileContextTags('#search:foo bar'));
