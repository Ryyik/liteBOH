/* 临时脚本：下载 picsum 固定 id 照片到 public/demo-album/（demo 影集内置素材） */
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT = 'public/demo-album';
mkdirSync(OUT, { recursive: true });

// [文件名, picsum id, 宽, 高] —— 尺寸与 demo-album.js 的 ratio 对应（横/竖/方）
const IMAGES = [
  ['p1.jpg', 1015, 1200, 900],
  ['p2.jpg', 1016, 1200, 900],
  ['p3.jpg', 1018, 900, 1200],
  ['p4.jpg', 1019, 1000, 1000],
  ['p5.jpg', 1036, 1200, 900],
  ['p6.jpg', 1039, 1000, 1000],
  ['p7.jpg', 1043, 900, 1200],
  ['p8.jpg', 1050, 1200, 900],
];

for (const [name, id, w, h] of IMAGES) {
  const file = join(OUT, name);
  execFileSync('curl', [
    '-sL',
    `https://picsum.photos/id/${id}/${w}/${h}`,
    '-o',
    file,
    '--max-time',
    '60',
  ]);
  console.log(`${name} (id=${id}) done`);
}
console.log('all demo images downloaded');
