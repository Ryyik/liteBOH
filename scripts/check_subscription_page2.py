"""详细检查订阅页面的渲染情况"""
from playwright.sync_api import sync_playwright
import traceback

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    
    errors = []
    warnings = []
    page.on("pageerror", lambda e: errors.append(f"PAGE ERROR: {str(e)}"))
    def console_handler(msg):
        if msg.type == "error":
            errors.append(f"CONSOLE ERROR: {msg.text}")
        elif msg.type == "warning":
            warnings.append(f"CONSOLE WARN: {msg.text}")
    page.on("console", console_handler)
    
    try:
        # 访问订阅计划页面
        page.goto('http://localhost:5173/user-space/subscriptions', wait_until='networkidle', timeout=60000)
        page.wait_for_timeout(5000)
        
        # 检查页面上所有class
        classes = page.evaluate("""() => {
            const all = document.querySelectorAll('[class]');
            const classSet = new Set();
            all.forEach(el => el.className.toString().split(/\\s+/).filter(c => c).forEach(c => classSet.add(c)));
            return Array.from(classSet).sort();
        }""")
        
        music_classes = [c for c in classes if 'plan' in c.lower() or 'music' in c.lower() or 'staff' in c.lower() or 'hero' in c.lower() or 'term' in c.lower()]
        print(f"📦 找到 {len(classes)} 个class，其中疑似音乐/订阅主题的class:")
        for c in music_classes:
            print(f"  - {c}")
        
        # 检查 subscription-plans 元素
        plan_container = page.query_selector('.subscription-plans')
        if plan_container:
            html_snippet = plan_container.evaluate("el => el.innerHTML.substring(0, 2000)")
            print(f"\n📝 .subscription-plans 内容预览:\n{html_snippet}")
        else:
            print("\n⚠️  没有找到 .subscription-plans 元素")
        
        # 截图完整页面
        page.screenshot(path='/tmp/subscription_detail_full.png', full_page=True)
        print("\n✅ 完整页面截图已保存")
        
    except Exception as e:
        print(f"❌ 错误: {str(e)}")
        traceback.print_exc()
    finally:
        if errors:
            print("\n🛑 控制台错误:")
            for e in errors[:20]:
                print(f"  - {e}")
        if warnings:
            print("\n⚠️  控制台警告:")
            for w in warnings[:10]:
                print(f"  - {w}")
        browser.close()
