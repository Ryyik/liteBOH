#!/usr/bin/env python3
"""
cloudinary-presets.py — Cloudinary upload preset 的只读巡检与签名模式切换。

## 用途

`BOHIMG` 曾是一个 **unsigned（无签名）** 的 upload preset，且**没有任何约束**
（无 allowed_formats / max_file_size / folder）—— 意味着任何拿到 cloud_name + preset 名的人
（两者都内联在前端产物里）都能直接往账号上传任意类型、任意大小的文件，
完全绕过 Supabase Edge Function 的登录校验与额度预检。

本脚本用于：巡检 preset 签名状态、创建 signed preset、把遗留的 unsigned preset 收口。
配套的运行时切换在 Supabase 侧（`secrets set CLOUDINARY_UPLOAD_MODE=signed`）。

## 凭据

读 `~/.cloudinary-auto`，格式（权限建议 600）：

    cloud_name=xxx
    api_key=xxx
    api_secret=xxx

**脚本不会打印凭据。** Cloudinary Admin API 用 **Basic Auth**（不是 Bearer）。

## 用法

    python3 scripts/cloudinary-presets.py probe
    python3 scripts/cloudinary-presets.py create-signed <name>
    python3 scripts/cloudinary-presets.py set-signed     <name>     # 收口：unsigned=false
    python3 scripts/cloudinary-presets.py set-unsigned   <name>     # 回滚：unsigned=true

## 相关的关键事实（2026-09-21 实测）

- `unsigned` 是 preset 上的布尔字段，**默认 false（= 只允许签名上传）**。
  改成 Signed 就是把它设为 `false`。
- 监听/排障时的**无损判据**：向 `/image/upload` 发一个**不带 file** 的请求，看错误信息 ——
  - `Upload preset must be whitelisted for unsigned uploads` → 该 preset 是 **signed**（好）
  - `Missing required parameter - file` → 该 preset **接受无签名**（untrusted，需要收口）
  - `Upload preset must be specified when using unsigned upload` → 没带 preset 时的对照
- 切换 1（preset → signed）与切换 2（Supabase 侧的 `CLOUDINARY_UPLOAD_MODE`）**必须都做**：
  只做其一，上传会**永久失败**（不是短暂窗口）——
  signed preset 会拒绝 `signature`/`api_key`/`timestamp`（它们不在 unsigned 参数白名单里），
  unsigned preset 则会拒绝「只带签名的请求」。
  推荐做法：**先新建一个 signed preset**，再用**一条命令同时切**
  `CLOUDINARY_UPLOAD_PRESET` 与 `CLOUDINARY_UPLOAD_MODE` → **零窗口**。
"""
import base64
import json
import pathlib
import sys
import urllib.error
import urllib.request

CRED_PATH = pathlib.Path.home() / '.cloudinary-auto'


def load_credentials():
    if not CRED_PATH.exists():
        raise SystemExit(f'缺少凭据文件：{CRED_PATH}')
    values = {}
    for line in CRED_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, _, value = line.partition('=')
        values[key.strip()] = value.strip()
    missing = [k for k in ('cloud_name', 'api_key', 'api_secret') if not values.get(k)]
    if missing:
        raise SystemExit(f'凭据文件缺少字段：{missing}')
    return values


_CREDS = load_credentials()
_CLOUD = _CREDS['cloud_name']
_AUTH = base64.b64encode(f"{_CREDS['api_key']}:{_CREDS['api_secret']}".encode()).decode()
_BASE = f'https://api.cloudinary.com/v1_1/{_CLOUD}'


def api(path, method='GET', form=None):
    data = form.encode() if form else None
    headers = {'Authorization': f'Basic {_AUTH}'}
    if data:
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    request = urllib.request.Request(_BASE + path, method=method, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode()
            try:
                return response.status, json.loads(raw)
            except json.JSONDecodeError:
                return response.status, raw
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:400]


def unsigned_probe(preset_name):
    """无损判定某 preset 是否接受无签名上传（不带 file，不产生任何资源）。"""
    request = urllib.request.Request(
        _BASE + '/image/upload',
        method='POST',
        data=f'upload_preset={preset_name}'.encode(),
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            return response.status, response.read().decode()[:200]
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:240]


def probe():
    print(f'cloud_name = {_CLOUD}（api_key / api_secret 已读取，不打印）')
    print()
    status, data = api('/upload_presets')
    if status != 200:
        raise SystemExit(f'GET /upload_presets 失败：HTTP {status} {data}')
    presets = data.get('presets', [])
    print(f'共 {len(presets)} 个 upload preset：')
    print()
    for item in presets:
        name = item.get('name')
        unsigned = item.get('unsigned')
        verdict = '⚠️  接受无签名上传（需要收口）' if unsigned else '✅ 只允许签名上传'
        print(f'  {name}')
        print(f'    unsigned = {unsigned}   {verdict}')
        status, detail = api(f'/upload_presets/{name}')
        if status == 200 and isinstance(detail, dict):
            extras = {k: v for k, v in detail.items() if k != 'name'}
            if extras:
                print(f'    其它字段 = {json.dumps(extras, ensure_ascii=False)}')
            else:
                print('    其它字段 = （空 —— 该 preset 没有任何格式/大小约束）')
        code, body = unsigned_probe(name)
        print(f'    无损探针 -> HTTP {code}  {body[:110]}')
        print()


def set_unsigned_flag(name, unsigned):
    status, data = api(f'/upload_presets/{name}', method='PUT', form=f'unsigned={"true" if unsigned else "false"}')
    print(f'PUT /upload_presets/{name} unsigned={unsigned} -> HTTP {status}  '
          f'{json.dumps(data, ensure_ascii=False)[:160] if isinstance(data, dict) else data}')
    return status == 200


def create_signed(name):
    status, data = api('/upload_presets', method='POST', form=f'name={name}&unsigned=false')
    print(f'POST /upload_presets name={name} unsigned=false -> HTTP {status}  '
          f'{json.dumps(data, ensure_ascii=False)[:160] if isinstance(data, dict) else data}')
    return status == 200


if __name__ == '__main__':
    action = sys.argv[1] if len(sys.argv) > 1 else 'probe'
    if action == 'probe':
        probe()
    elif action in {'create-signed', 'set-signed', 'set-unsigned'} and len(sys.argv) > 2:
        target = sys.argv[2]
        ok = create_signed(target) if action == 'create-signed' else set_unsigned_flag(target, action == 'set-unsigned')
        sys.exit(0 if ok else 1)
    else:
        raise SystemExit(__doc__.strip().split('## 用法')[-1].strip())
