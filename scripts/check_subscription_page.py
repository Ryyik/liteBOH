"""简单验证订阅页面是否能正常加载"""
from playwright.sync_api import sync_playwright
import traceback

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    
    errors = []
    page.on("pageerror", lambda e: errors.append(f"PAGE ERROR: {str(e)}"))
    page.on("console", lambda msg: errors.append(f"CONSOLE {msg.type}: {msg.text}") if msg.type in ("error", "warning") else None)
    
    try:
        # 先访问首页
        page.goto('http://localhost:5173/', wait_until='domcontentloaded', timeout=30000)
        page.wait_for_timeout(3000)
        
        # 截图首页
        page.screenshot(path='/tmp/subscription_page_1_home.png', full_page=False)
        print("✅ 首页已加载")
        
        # 访问订阅计划页面
        page.goto('http://localhost:5173/user-space/subscriptions', wait_until='domcontentloaded', timeout=30000)
        page.wait_for_timeout(5000)
        
        # 截图订阅页面
        page.screenshot(path='/tmp/subscription_page_2_detail.png', full_page=True)
        print("✅ 订阅计划页面已加载并截图完成")
        
        # 检查是否有音乐主题相关元素
        content = page.content()
        has_music_term = 'plan-term' in content or '音乐术语' in content or 'Adagio' in content or 'Andante' in content
        print(f"🎵 音乐主题元素检测: {'找到' if has_music_term else '未找到'}")
        
    except Exception as e:
        print(f"❌ 错误: {str(e)}")
        traceback.print_exc()
    finally:
        if errors:
            print("\n⚠️  控制台错误/警告:")
            for e in errors[:15]:
                print(f"  - {e}")
        browser.close()
