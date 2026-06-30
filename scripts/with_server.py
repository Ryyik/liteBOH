#!/usr/bin/env python3
"""
开发服务器启动脚本
用于在运行测试之前启动 Vite 开发服务器
"""

import subprocess
import sys
import time
import http.client
import os
from pathlib import Path


def wait_for_server(host: str = "localhost", port: int = 5173, timeout: int = 30) -> bool:
    """等待服务器启动"""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            conn = http.client.HTTPConnection(host, port, timeout=1)
            conn.request("GET", "/")
            response = conn.getresponse()
            conn.close()
            if response.status in [200, 304]:
                return True
        except (ConnectionRefusedError, http.client.HTTPException, OSError):
            pass
        time.sleep(0.5)
    return False


def start_server():
    """启动 Vite 开发服务器"""
    # 获取项目根目录
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    print(f"🚀 启动 Vite 开发服务器...")
    print(f"📁 项目根目录: {project_root}")
    print(f"🌐 服务器地址: http://localhost:5173")

    # 启动 Vite 开发服务器
    process = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(project_root),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    # 等待服务器启动
    print("⏳ 等待服务器启动...")
    if wait_for_server():
        print("✅ 服务器已启动并就绪！")
        return process
    else:
        print("❌ 服务器启动超时")
        process.terminate()
        sys.exit(1)


def main():
    """主函数"""
    # 启动服务器
    process = start_server()

    try:
        # 保持脚本运行，直到被中断
        print("\n💡 按 Ctrl+C 停止服务器")
        process.wait()
    except KeyboardInterrupt:
        print("\n\n🛑 正在停止服务器...")
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
        print("✅ 服务器已停止")


if __name__ == "__main__":
    main()