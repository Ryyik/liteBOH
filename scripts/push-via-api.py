#!/usr/bin/env python3
"""
push-via-api.py — 当 github.com 的 HTTPS 不通时，改用 GitHub Git Data API 推送。

## 为什么需要它

本机网络对 `github.com` 是 **SNI 阻断**：TCP 443 能连上（`nc -z` 成功），但 TLS
握手直接失败（`curl` 得到 `HTTP=000`），因此 `git push` 会卡住 75 秒后报
`Failed to connect to github.com port 443`。

同一时刻：
  - `api.github.com` **完全可用**（TLS 0.17s / HTTP 200）
  - `gh` CLI 已认证，且 token 带 `repo` scope

所以绕开 git 的传输层，直接用对象 API 写仓库即可。

## 它做的事

逐个本地提交地：
  1. 为该提交相对 parent 变更的每个文件创建 blob（删除的文件记 `sha: null`）
  2. 以 parent 的 tree 为 `base_tree` 创建新 tree
  3. 创建 commit —— **完整复现 author / committer / date / message**
  4. 全部构造成功后一次性更新 `refs/heads/main`

因为元数据被完整复现，**commit SHA 与本地一致**（已实测），所以推送后本地无需
任何对齐操作，`git status` 保持干净、历史完全一致。

## 用法

    python3 scripts/push-via-api.py             # 干跑：只构造，不更新 ref
    python3 scripts/push-via-api.py --apply     # 真正推送

干跑会打印每个提交的 tree/commit SHA 与本地是否吻合，据此判断能否安全推送。

## 安全性

创建 blob / tree / commit 都是**悬空对象**，不改变仓库可见状态；只有最后更新 ref
才对外生效。ref 更新用 `force: false`，所以若远端在此期间被别人推进，本次会失败
而不是覆盖。

## 前置条件

- `gh` 已登录且 token 含 `repo` scope（`gh auth status`）
- 需要访问 `api.github.com`；若本机代理变量指向失效代理，用
  `env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy` 运行
- `refs/remotes/origin/main` 必须反映真实远端（fetch 不通时可先用
  `gh api repos/<owner>/<repo>/git/refs/heads/main --jq .object.sha` 核对并回填）
"""
import base64
import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

# 注意两者格式不同：git 要完整 ref 名，GitHub API 的 /git/refs/ 端点要短名。
# 把 'refs/heads/main' 直接拼进 API 路径会得到 /git/refs/refs/heads/main → HTTP 422。
BRANCH_GIT = 'refs/heads/main'
BRANCH_API = 'heads/main'
REMOTE_REF = 'refs/remotes/origin/main'
APPLY = '--apply' in sys.argv


def git(*args, binary=False):
    result = subprocess.run(
        ['git', '-c', 'core.quotepath=false', *args], capture_output=True,
    )
    if result.returncode != 0:
        raise SystemExit('git ' + ' '.join(args) + ' 失败: ' + result.stderr.decode())
    return result.stdout if binary else result.stdout.decode()


def resolve_repo_slug():
    url = git('remote', 'get-url', 'origin').strip()
    for prefix in ('https://github.com/', 'git@github.com:', 'git@ssh.github.com:'):
        if url.startswith(prefix):
            slug = url[len(prefix):]
            return slug[:-4] if slug.endswith('.git') else slug
    raise SystemExit('无法从 origin URL 解析出 owner/repo：' + url)


def gh_token():
    out = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit('gh auth token 失败（是否未登录？）：' + out.stderr)
    return out.stdout.strip()


REPO = resolve_repo_slug()
TOKEN = gh_token()
API = f'https://api.github.com/repos/{REPO}'


def api(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        API + path,
        method=method,
        data=data,
        headers={
            'Authorization': f'token {TOKEN}',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'boh-push-via-api',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as exc:
        print(f'  !! HTTP {exc.code}: {exc.read().decode()[:400]}')
        raise


def parse_commit(sha):
    """从本地 commit 对象解析出可完整复现 SHA 所需的全部元数据。"""
    lines = git('cat-file', 'commit', sha).split('\n')
    header, idx = {}, 0
    while idx < len(lines) and lines[idx].strip():
        key, _, value = lines[idx].partition(' ')
        header.setdefault(key, []).append(value)
        idx += 1
    message = '\n'.join(lines[idx + 1:])

    def ident(line):
        name_email, ts_tz = line.rsplit('> ', 1)
        name, _, email = name_email.partition(' <')
        ts, tz = ts_tz.split(' ')
        offset = int(tz[1:3]) * (1 if tz[0] == '+' else -1)
        dt = datetime.fromtimestamp(int(ts), tz=timezone(timedelta(hours=offset)))
        return {'name': name, 'email': email, 'date': dt.isoformat()}

    return {
        'tree': header['tree'][0],
        'author': ident(header['author'][0]),
        'committer': ident(header['committer'][0]),
        'message': message,
    }


def main():
    # 只推送 origin/main..HEAD 之间**已提交**的内容；工作区未提交的改动不在范围内
    base = git('rev-parse', REMOTE_REF).strip()
    commits = [c for c in git('log', '--format=%H', f'{base}..HEAD').split('\n') if c][::-1]
    if not commits:
        print('没有待推送的提交。')
        return

    print(f'仓库 {REPO} | 分支 {BRANCH_GIT}')
    print(f'远端 base {base[:8]}')
    print(f'待推送 {len(commits)} 个提交')
    print()

    base_tree = api('GET', f'/git/commits/{base}')['tree']['sha']
    local_parent, remote_parent = base, base
    all_match = True

    for sha in commits:
        meta = parse_commit(sha)
        status_lines = [l for l in git('diff', '--name-status', local_parent, sha).split('\n') if l]
        print(f'--- {sha[:8]}  {len(status_lines)} 项变更  {meta["message"].splitlines()[0][:56]}')

        entries = []
        for line in status_lines:
            parts = line.split('\t')
            status, path = parts[0], parts[-1]
            if status.startswith('D'):
                entries.append({'path': path, 'mode': '100644', 'type': 'blob', 'sha': None})
                continue
            mode_line = git('ls-tree', sha, '--', path).strip()
            mode = mode_line.split(' ', 1)[0] if mode_line else '100644'
            content = git('show', f'{sha}:{path}', binary=True)
            blob = api('POST', '/git/blobs', {
                'content': base64.b64encode(content).decode(),
                'encoding': 'base64',
            })
            entries.append({'path': path, 'mode': mode, 'type': 'blob', 'sha': blob['sha']})

        tree = api('POST', '/git/trees', {'base_tree': base_tree, 'tree': entries})
        tree_ok = tree['sha'] == meta['tree']

        commit = api('POST', '/git/commits', {
            'message': meta['message'],
            'tree': tree['sha'],
            'parents': [remote_parent],
            'author': meta['author'],
            'committer': meta['committer'],
        })
        sha_ok = commit['sha'] == sha
        all_match = all_match and tree_ok and sha_ok

        print(f'    tree   {tree["sha"][:8]} vs 本地 {meta["tree"][:8]}  {"OK" if tree_ok else "MISMATCH"}')
        print(f'    commit {commit["sha"][:8]} vs 本地 {sha[:8]}  {"OK" if sha_ok else "MISMATCH"}')

        local_parent, remote_parent, base_tree = sha, commit['sha'], tree['sha']

    print()
    print(f'SHA 与本地完全一致：{"是" if all_match else "否（内容一致，但本地需回指远端新 SHA）"}')
    print(f'目标 {BRANCH_GIT} -> {remote_parent}')

    if not APPLY:
        print('（干跑，未更新 ref。加 --apply 才真正推送）')
        return

    api('PATCH', f'/git/refs/{BRANCH_API}', {'sha': remote_parent, 'force': False})
    git('update-ref', REMOTE_REF, remote_parent)
    print(f'✅ 已推送并回填 {REMOTE_REF} = {remote_parent[:8]}')


main()
