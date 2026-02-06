from playwright.sync_api import sync_playwright
import time

def verify_miglo():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Load the page (assuming local server is running)
        page.goto("http://localhost:4321/guild/miglo.html")
        page.wait_for_selector("#entrance-screen", state="detached", timeout=10000)

        # Check title
        title = page.title()
        assert "Miglo Jelly" in title, f"Title mismatch: {title}"
        print("✅ Title verified")

        # Calculate max scroll
        scroll_height = page.evaluate("document.body.scrollHeight")
        viewport_height = page.evaluate("window.innerHeight")
        max_scroll = scroll_height - viewport_height

        # Scroll to Services (approx 40% progress)
        page.evaluate(f"window.scrollTo(0, {max_scroll * 0.40})")
        time.sleep(2)

        # Check Services content
        content = page.content()
        assert "服務 SERVICES" in content
        assert "有機真花選材" in content
        print("✅ Services section content verified")

        page.screenshot(path="verification/miglo_services.png")
        print("📸 Services screenshot captured")

        # Scroll to Gallery Safe Zone (95% progress)
        # Gallery logic: End of stagger is 90% top (of element relative to viewport? No, ScrollTrigger default is element top vs viewport top usually, but here 'scrub: 1' on '#scroll-spacer' implies absolute scroll progress)
        # The code says: trigger: "#scroll-spacer", start: "80% top"
        # Since #scroll-spacer is the whole page (z-index -1), "80% top" means when the 80% mark of the spacer hits the top of the viewport.
        # This basically maps 1:1 with scroll progress.

        # Target: 95% progress.
        page.evaluate(f"window.scrollTo(0, {max_scroll * 0.95})")
        time.sleep(2)

        # Check Gallery items
        gallery_items = page.locator(".g-item")
        count = gallery_items.count()
        assert count >= 8, f"Gallery count mismatch: {count}"
        print(f"✅ Gallery items verified: {count}")

        # Verify Finale is NOT active yet
        # Finale trigger: "99.5% bottom" -> When 99.5% of spacer hits BOTTOM of viewport.
        # Spacer is 1500vh. 99.5% is 1492.5vh.
        # When 1492.5vh is at bottom, top is at 1392.5vh.
        # Max scroll is 1400vh.
        # So it triggers extremely close to the end.
        # At 95% scroll (approx 1330vh), it should definitely be inactive.

        finale = page.locator("#finale")
        class_attr = finale.get_attribute("class")

        # Check if 'active' is present
        is_active = "active" in class_attr if class_attr else False

        if is_active:
             print(f"❌ Finale IS active at 95% scroll. Class: {class_attr}")
        else:
             print("✅ Finale overlay correctly inactive at 95%")

        assert not is_active, "Finale overlay should NOT be active at 95% scroll"

        page.screenshot(path="verification/miglo_gallery_safe.png")
        print("📸 Gallery Safe Zone screenshot captured")

        browser.close()

if __name__ == "__main__":
    verify_miglo()
