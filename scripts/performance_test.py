#!/usr/bin/env python3
"""
Playwright 性能测试脚本
测试 BOH 网站的运行时性能，包括页面加载、交互、资源加载和内存使用
"""

import subprocess
import sys
import time
import json
import asyncio
import platform
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional

try:
    from playwright.async_api import async_playwright, Page, Browser, BrowserContext
except ImportError:
    print("❌ 未找到 Playwright 库")
    print("📦 正在安装 Playwright...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    print("✅ Playwright 安装完成，正在重新运行测试...")
    subprocess.call([sys.executable, __file__])
    sys.exit(0)


# 测试配置
BASE_URL = "http://localhost:5173"
TEST_RESULTS_DIR = Path(__file__).parent.parent / "test-results" / "performance"
SCREENSHOT_DIR = TEST_RESULTS_DIR / "screenshots"

# 测试页面配置
TEST_PAGES = {
    "首页": "/",
    "BOHAI (AI聊天)": "/#/ai-chat",
    "用户中心": "/#/user-space",
    "商店": "/#/shop",
    "关于我们": "/#/about",
    "活动列表": "/#/activities",
}


class PerformanceMetrics:
    """性能指标收集器"""

    def __init__(self):
        self.metrics: Dict[str, Any] = {}
        self.memory_samples: List[Dict[str, Any]] = []
        self.network_requests: List[Dict[str, Any]] = []

    def add_page_metrics(self, page_name: str, metrics: Dict[str, Any]):
        """添加页面性能指标"""
        if page_name not in self.metrics:
            self.metrics[page_name] = {}
        self.metrics[page_name].update(metrics)

    def add_memory_sample(self, timestamp: float, memory_data: Dict[str, Any]):
        """添加内存采样数据"""
        self.memory_samples.append({
            "timestamp": timestamp,
            **memory_data
        })

    def add_network_request(self, request_data: Dict[str, Any]):
        """添加网络请求数据"""
        self.network_requests.append(request_data)

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式"""
        return {
            "metrics": self.metrics,
            "memory_samples": self.memory_samples,
            "network_requests": self.network_requests,
        }


async def measure_page_load_performance(page: Page, url: str, page_name: str) -> Dict[str, Any]:
    """测量页面加载性能"""
    print(f"\n📊 测试页面加载性能: {page_name}")
    print(f"   URL: {url}")

    metrics = {}

    try:
        # 开始性能追踪
        await page.evaluate("window.performance.mark('page-load-start')")

        # 导航到页面
        start_time = time.time()
        response = await page.goto(url, wait_until="networkidle", timeout=30000)
        load_time = time.time() - start_time

        # 等待页面稳定
        await page.wait_for_timeout(1000)

        # 收集性能指标
        performance_timing = await page.evaluate("""
            () => {
                const timing = performance.timing.toJSON();
                const navigation = performance.getEntriesByType('navigation')[0];
                const paint = performance.getEntriesByType('paint');
                const layoutShift = performance.getEntriesByType('layout-shift');

                return {
                    timing: timing,
                    navigation: navigation ? {
                        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
                        domInteractive: navigation.domInteractive,
                        responseEnd: navigation.responseEnd,
                    } : null,
                    paint: paint.map(p => ({
                        name: p.name,
                        startTime: p.startTime
                    })),
                    layoutShift: layoutShift.reduce((acc, entry) => acc + entry.value, 0),
                };
            }
        """)

        # 获取 Web Vitals
        web_vitals = await page.evaluate("""
            () => {
                return new Promise((resolve) => {
                    const vitals = {
                        FCP: null,
                        LCP: null,
                        CLS: null,
                        FID: null,
                    };

                    // FCP
                    const paintEntries = performance.getEntriesByType('paint');
                    const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
                    if (fcpEntry) vitals.FCP = fcpEntry.startTime;

                    // LCP
                    if ('PerformanceObserver' in window) {
                        try {
                            const lcpObserver = new PerformanceObserver((list) => {
                                const entries = list.getEntries();
                                const lastEntry = entries[entries.length - 1];
                                vitals.LCP = lastEntry.startTime;
                                lcpObserver.disconnect();
                            });
                            lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
                        } catch (e) {}

                        // CLS
                        try {
                            let clsValue = 0;
                            const clsObserver = new PerformanceObserver((list) => {
                                for (const entry of list.getEntries()) {
                                    if (!entry.hadRecentInput) {
                                        clsValue += entry.value;
                                    }
                                }
                                vitals.CLS = clsValue;
                            });
                            clsObserver.observe({ type: 'layout-shift', buffered: true });
                        } catch (e) {}
                    }

                    // 给一点时间让观察者捕获数据
                    setTimeout(() => resolve(vitals), 100);
                });
            }
        """)

        metrics = {
            "load_time": load_time,
            "response_status": response.status if response else None,
            "performance_timing": performance_timing,
            "web_vitals": web_vitals,
            "timestamp": datetime.now().isoformat(),
        }

        print(f"   ✅ 页面加载时间: {load_time:.2f}s")
        if web_vitals.get("FCP"):
            print(f"   ✅ FCP (首次内容绘制): {web_vitals['FCP']:.2f}ms")
        if web_vitals.get("LCP"):
            print(f"   ✅ LCP (最大内容绘制): {web_vitals['LCP']:.2f}ms")

    except Exception as e:
        print(f"   ❌ 页面加载测试失败: {e}")
        metrics["error"] = str(e)

    return metrics


async def measure_interaction_performance(page: Page, url: str, page_name: str) -> Dict[str, Any]:
    """测量交互性能"""
    print(f"\n🖱️  测试交互性能: {page_name}")

    metrics = {}

    try:
        # 导航到页面
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)

        # 测试滚动性能
        scroll_metrics = await test_scroll_performance(page)

        # 测试点击响应
        click_metrics = await test_click_response(page)

        metrics = {
            "scroll": scroll_metrics,
            "click": click_metrics,
            "timestamp": datetime.now().isoformat(),
        }

        print(f"   ✅ 滚动帧率: {scroll_metrics.get('avg_fps', 0):.1f} FPS")

    except Exception as e:
        print(f"   ❌ 交互性能测试失败: {e}")
        metrics["error"] = str(e)

    return metrics


async def test_scroll_performance(page: Page) -> Dict[str, Any]:
    """测试滚动性能"""
    metrics = {}

    try:
        # 测量滚动性能
        await page.evaluate("""
            () => {
                window.__scrollMetrics = {
                    frames: 0,
                    startTime: performance.now(),
                    lastFrameTime: performance.now(),
                    fps: []
                };

                function measureScroll() {
                    const now = performance.now();
                    window.__scrollMetrics.frames++;

                    if (now - window.__scrollMetrics.lastFrameTime >= 1000) {
                        const fps = window.__scrollMetrics.frames;
                        window.__scrollMetrics.fps.push(fps);
                        window.__scrollMetrics.frames = 0;
                        window.__scrollMetrics.lastFrameTime = now;
                    }
                }

                window.requestAnimationFrame(measureScroll);
                window.__scrollRAF = setInterval(() => {
                    window.requestAnimationFrame(measureScroll);
                }, 16);
            }
        """)

        # 执行滚动
        start_time = time.time()
        for _ in range(3):
            await page.evaluate("window.scrollBy(0, 500)")
            await page.wait_for_timeout(100)
            await page.evaluate("window.scrollBy(0, -500)")
            await page.wait_for_timeout(100)

        scroll_duration = time.time() - start_time

        # 获取滚动指标
        scroll_data = await page.evaluate("""
            () => {
                clearInterval(window.__scrollRAF);
                const fps = window.__scrollMetrics.fps;
                return {
                    avg_fps: fps.length > 0 ? fps.reduce((a, b) => a + b, 0) / fps.length : 0,
                    min_fps: fps.length > 0 ? Math.min(...fps) : 0,
                    max_fps: fps.length > 0 ? Math.max(...fps) : 0,
                    duration: window.__scrollMetrics.startTime ? (performance.now() - window.__scrollMetrics.startTime) : 0
                };
            }
        """)

        metrics = {
            "duration": scroll_duration,
            **scroll_data
        }

    except Exception as e:
        metrics["error"] = str(e)

    return metrics


async def test_click_response(page: Page) -> Dict[str, Any]:
    """测试点击响应速度"""
    metrics = {}

    try:
        # 查找可点击元素
        clickable_elements = await page.evaluate("""
            () => {
                const elements = document.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
                return elements.length;
            }
        """)

        metrics["clickable_elements"] = clickable_elements

        # 测试按钮点击响应（如果存在）
        try:
            button = await page.query_selector('button:not([disabled])')
            if button:
                start_time = time.time()
                await button.click(timeout=1000)
                click_time = time.time() - start_time
                metrics["button_click_time"] = click_time
                print(f"      ✅ 按钮点击响应: {click_time*1000:.1f}ms")
        except:
            pass

    except Exception as e:
        metrics["error"] = str(e)

    return metrics


async def measure_network_performance(page: Page, url: str, page_name: str) -> Dict[str, Any]:
    """测量网络性能"""
    print(f"\n🌐 测试网络性能: {page_name}")

    metrics = {
        "requests": [],
        "resources": [],
    }

    try:
        # 收集网络请求
        requests_data = []
        resources_data = []

        # 监听网络请求
        def on_request(request):
            requests_data.append({
                "url": request.url,
                "method": request.method,
                "resource_type": request.resource_type,
                "timestamp": time.time(),
            })

        def on_response(response):
            try:
                request = response.request
                headers = response.headers

                resources_data.append({
                    "url": response.url,
                    "status": response.status,
                    "method": request.method,
                    "resource_type": request.resource_type,
                    "size": int(headers.get("content-length", 0)),
                    "time": time.time(),
                })
            except:
                pass

        page.on("request", on_request)
        page.on("response", on_response)

        # 导航到页面
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)

        # 移除监听器
        page.remove_listener("request", on_request)
        page.remove_listener("response", on_response)

        # 分析资源大小
        total_size = sum(r.get("size", 0) for r in resources_data)
        by_type = {}
        for resource in resources_data:
            r_type = resource.get("resource_type", "other")
            if r_type not in by_type:
                by_type[r_type] = {"count": 0, "size": 0}
            by_type[r_type]["count"] += 1
            by_type[r_type]["size"] += resource.get("size", 0)

        metrics["requests"] = requests_data
        metrics["resources"] = resources_data
        metrics["summary"] = {
            "total_requests": len(requests_data),
            "total_resources": len(resources_data),
            "total_size_bytes": total_size,
            "total_size_mb": total_size / (1024 * 1024),
            "by_type": by_type,
        }

        print(f"   ✅ 总请求数: {len(requests_data)}")
        print(f"   ✅ 总资源大小: {total_size / (1024 * 1024):.2f} MB")

    except Exception as e:
        print(f"   ❌ 网络性能测试失败: {e}")
        metrics["error"] = str(e)

    return metrics


async def measure_memory_usage(page: Page, url: str, page_name: str, duration: int = 30) -> Dict[str, Any]:
    """测量内存使用情况"""
    print(f"\n💾 测试内存使用: {page_name} (持续 {duration} 秒)")

    metrics = {
        "samples": [],
        "summary": {},
    }

    try:
        # 导航到页面
        await page.goto(url, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)

        # 持续监控内存
        start_time = time.time()
        sample_interval = 2  # 每2秒采样一次
        samples_count = duration // sample_interval

        for i in range(samples_count):
            memory = await page.evaluate("""
                () => {
                    if (performance.memory) {
                        return {
                            usedJSHeapSize: performance.memory.usedJSHeapSize,
                            totalJSHeapSize: performance.memory.totalJSHeapSize,
                            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                        };
                    }
                    return null;
                }
            """)

            if memory:
                metrics["samples"].append({
                    "timestamp": time.time() - start_time,
                    "used_mb": memory["usedJSHeapSize"] / (1024 * 1024),
                    "total_mb": memory["totalJSHeapSize"] / (1024 * 1024),
                    "limit_mb": memory["jsHeapSizeLimit"] / (1024 * 1024),
                })

            await page.wait_for_timeout(sample_interval * 1000)

            # 执行一些交互以触发潜在的内存泄漏
            await page.evaluate("window.scrollBy(0, 100)")
            await page.wait_for_timeout(100)
            await page.evaluate("window.scrollBy(0, -100)")

        # 计算内存增长
        if len(metrics["samples"]) >= 2:
            first_sample = metrics["samples"][0]
            last_sample = metrics["samples"][-1]

            growth = last_sample["used_mb"] - first_sample["used_mb"]
            growth_percent = (growth / first_sample["used_mb"]) * 100 if first_sample["used_mb"] > 0 else 0

            metrics["summary"] = {
                "initial_mb": first_sample["used_mb"],
                "final_mb": last_sample["used_mb"],
                "growth_mb": growth,
                "growth_percent": growth_percent,
                "peak_mb": max(s["used_mb"] for s in metrics["samples"]),
                "avg_mb": sum(s["used_mb"] for s in metrics["samples"]) / len(metrics["samples"]),
            }

            print(f"   ✅ 初始内存: {first_sample['used_mb']:.2f} MB")
            print(f"   ✅ 最终内存: {last_sample['used_mb']:.2f} MB")
            print(f"   ✅ 内存增长: {growth:.2f} MB ({growth_percent:.1f}%)")

    except Exception as e:
        print(f"   ❌ 内存测试失败: {e}")
        metrics["error"] = str(e)

    return metrics


async def run_performance_tests():
    """运行所有性能测试"""
    print("=" * 80)
    print("🎭 BOH 网站 Playwright 性能测试")
    print("=" * 80)
    print(f"📅 测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🌐 测试地址: {BASE_URL}")
    print(f"🖥️  操作系统: {platform.system()} {platform.release()}")
    print("=" * 80)

    # 创建结果目录
    TEST_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

    # 初始化性能指标收集器
    all_metrics = PerformanceMetrics()

    async with async_playwright() as p:
        # 启动浏览器
        print("\n🚀 启动浏览器...")
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-setuid-sandbox",
            ]
        )

        # 创建上下文
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )

        # 创建页面
        page = await context.new_page()

        try:
            # 测试每个页面
            for page_name, path in TEST_PAGES.items():
                url = f"{BASE_URL}{path}"

                # 1. 页面加载性能测试
                load_metrics = await measure_page_load_performance(page, url, page_name)
                all_metrics.add_page_metrics(page_name, {"load": load_metrics})

                # 截图
                screenshot_path = SCREENSHOT_DIR / f"{page_name.replace(' ', '_')}.png"
                await page.screenshot(path=str(screenshot_path))
                print(f"   📸 截图保存: {screenshot_path}")

                # 2. 交互性能测试
                interaction_metrics = await measure_interaction_performance(page, url, page_name)
                all_metrics.add_page_metrics(page_name, {"interaction": interaction_metrics})

                # 3. 网络性能测试
                network_metrics = await measure_network_performance(page, url, page_name)
                all_metrics.add_page_metrics(page_name, {"network": network_metrics})

                # 4. 内存使用测试（仅对部分关键页面）
                if page_name in ["首页", "BOHAI (AI聊天)", "用户中心"]:
                    memory_metrics = await measure_memory_usage(page, url, page_name, duration=15)
                    all_metrics.add_page_metrics(page_name, {"memory": memory_metrics})

                print(f"\n{'=' * 80}")

        except Exception as e:
            print(f"\n❌ 测试过程中出错: {e}")
            import traceback
            traceback.print_exc()

        finally:
            # 关闭浏览器
            await context.close()
            await browser.close()

    # 保存结果
    results = all_metrics.to_dict()
    report_path = TEST_RESULTS_DIR / f"performance_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 测试完成！结果已保存到: {report_path}")

    # 生成摘要报告
    await generate_summary_report(results)

    return results


async def generate_summary_report(results: Dict[str, Any]):
    """生成摘要报告"""
    report_lines = []
    report_lines.append("\n" + "=" * 80)
    report_lines.append("📊 性能测试摘要报告")
    report_lines.append("=" * 80)

    # 页面加载性能摘要
    report_lines.append("\n【页面加载性能】")
    report_lines.append("-" * 80)
    report_lines.append(f"{'页面名称':<25} {'加载时间':<15} {'FCP':<15} {'LCP':<15}")
    report_lines.append("-" * 80)

    for page_name, metrics in results.get("metrics", {}).items():
        load_metrics = metrics.get("load", {})
        load_time = load_metrics.get("load_time", 0)
        web_vitals = load_metrics.get("web_vitals", {})

        fcp = web_vitals.get("FCP")
        lcp = web_vitals.get("LCP")

        fcp_str = f"{fcp:.0f}ms" if fcp else "N/A"
        lcp_str = f"{lcp:.0f}ms" if lcp else "N/A"

        report_lines.append(f"{page_name:<25} {load_time:>6.2f}s        {fcp_str:<15} {lcp_str:<15}")

    # 交互性能摘要
    report_lines.append("\n【交互性能】")
    report_lines.append("-" * 80)
    report_lines.append(f"{'页面名称':<25} {'平均FPS':<15} {'可点击元素':<15}")
    report_lines.append("-" * 80)

    for page_name, metrics in results.get("metrics", {}).items():
        interaction_metrics = metrics.get("interaction", {})
        scroll_metrics = interaction_metrics.get("scroll", {})
        click_metrics = interaction_metrics.get("click", {})

        avg_fps = scroll_metrics.get("avg_fps", 0)
        clickable = click_metrics.get("clickable_elements", 0)

        report_lines.append(f"{page_name:<25} {avg_fps:>6.1f} FPS      {clickable:<15}")

    # 网络性能摘要
    report_lines.append("\n【网络性能】")
    report_lines.append("-" * 80)
    report_lines.append(f"{'页面名称':<25} {'总请求数':<15} {'资源大小':<15}")
    report_lines.append("-" * 80)

    for page_name, metrics in results.get("metrics", {}).items():
        network_metrics = metrics.get("network", {})
        summary = network_metrics.get("summary", {})

        total_requests = summary.get("total_requests", 0)
        total_size_mb = summary.get("total_size_mb", 0)

        report_lines.append(f"{page_name:<25} {total_requests:<15} {total_size_mb:>6.2f} MB      ")

    # 内存使用摘要
    report_lines.append("\n【内存使用】")
    report_lines.append("-" * 80)
    report_lines.append(f"{'页面名称':<25} {'初始内存':<15} {'最终内存':<15} {'增长':<15}")
    report_lines.append("-" * 80)

    for page_name, metrics in results.get("metrics", {}).items():
        memory_metrics = metrics.get("memory", {})
        if memory_metrics and "summary" in memory_metrics:
            summary = memory_metrics["summary"]

            initial_mb = summary.get("initial_mb", 0)
            final_mb = summary.get("final_mb", 0)
            growth_mb = summary.get("growth_mb", 0)

            report_lines.append(
                f"{page_name:<25} {initial_mb:>6.2f} MB      {final_mb:>6.2f} MB      {growth_mb:>+6.2f} MB      "
            )

    # 性能问题分析
    report_lines.append("\n【性能问题分析】")
    report_lines.append("-" * 80)

    issues = []

    # 检查页面加载时间
    for page_name, metrics in results.get("metrics", {}).items():
        load_metrics = metrics.get("load", {})
        load_time = load_metrics.get("load_time", 0)

        if load_time > 3:
            issues.append(f"⚠️  {page_name}: 加载时间过长 ({load_time:.2f}s)")

        web_vitals = load_metrics.get("web_vitals", {})
        lcp = web_vitals.get("LCP")
        fcp = web_vitals.get("FCP")

        if fcp and fcp > 1800:
            issues.append(f"⚠️  {page_name}: FCP 过慢 ({fcp:.0f}ms)")

        if lcp and lcp > 2500:
            issues.append(f"⚠️  {page_name}: LCP 过慢 ({lcp:.0f}ms)")

    # 检查内存增长
    for page_name, metrics in results.get("metrics", {}).items():
        memory_metrics = metrics.get("memory", {})
        if memory_metrics and "summary" in memory_metrics:
            summary = memory_metrics["summary"]
            growth_percent = summary.get("growth_percent", 0)

            if growth_percent > 50:
                issues.append(f"⚠️  {page_name}: 可能存在内存泄漏 (增长 {growth_percent:.1f}%)")

    # 检查资源大小
    for page_name, metrics in results.get("metrics", {}).items():
        network_metrics = metrics.get("network", {})
        summary = network_metrics.get("summary", {})
        total_size_mb = summary.get("total_size_mb", 0)

        if total_size_mb > 5:
            issues.append(f"⚠️  {page_name}: 资源体积过大 ({total_size_mb:.2f} MB)")

    if issues:
        for issue in issues:
            report_lines.append(issue)
    else:
        report_lines.append("✅ 未发现明显性能问题")

    # 优化建议
    report_lines.append("\n【优化建议】")
    report_lines.append("-" * 80)

    suggestions = []

    # 根据测试结果给出建议
    for page_name, metrics in results.get("metrics", {}).items():
        load_metrics = metrics.get("load", {})
        web_vitals = load_metrics.get("web_vitals", {})
        network_metrics = metrics.get("network", {})
        summary = network_metrics.get("summary", {})

        lcp = web_vitals.get("LCP")
        if lcp and lcp > 2500:
            suggestions.append(f"💡 {page_name}: 优化 LCP - 考虑预加载关键资源、优化图片加载")

        total_size_mb = summary.get("total_size_mb", 0)
        if total_size_mb > 3:
            suggestions.append(f"💡 {page_name}: 减少资源体积 - 考虑代码分割、图片压缩、使用 CDN")

        # 检查是否是 BOHAI 页面
        if "BOHAI" in page_name:
            suggestions.append(f"💡 {page_name}: AI 聊天页面 - 考虑懒加载 AI 组件、优化消息列表渲染")

        # 检查是否是用户中心
        if "用户中心" in page_name:
            suggestions.append(f"💡 {page_name}: 用户中心 - 考虑数据分页加载、骨架屏优化")

    if suggestions:
        for suggestion in suggestions:
            report_lines.append(suggestion)
    else:
        report_lines.append("✅ 性能表现良好，继续保持！")

    report_lines.append("\n" + "=" * 80)

    # 打印报告
    report_text = "\n".join(report_lines)
    print(report_text)

    # 保存报告
    report_path = TEST_RESULTS_DIR / f"summary_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report_text)

    print(f"\n📄 摘要报告已保存到: {report_path}")


def main():
    """主函数"""
    # 检查服务器是否运行
    print("🔍 检查开发服务器...")
    import http.client
    try:
        conn = http.client.HTTPConnection("localhost", 5173, timeout=2)
        conn.request("GET", "/")
        response = conn.getresponse()
        conn.close()
        print("✅ 开发服务器正在运行")
    except:
        print("❌ 开发服务器未运行")
        print("💡 请先运行: python scripts/with_server.py")
        print("   或在其他终端运行: npm run dev")
        sys.exit(1)

    # 运行测试
    asyncio.run(run_performance_tests())


if __name__ == "__main__":
    main()