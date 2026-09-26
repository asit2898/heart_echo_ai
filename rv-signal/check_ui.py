"""Run the local server on port 8767 before checking the prototype UI."""
import asyncio
import os
import re

from playwright.async_api import async_playwright


async def main():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 980})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        origin = os.environ.get("HEART_ECHO_TEST_ORIGIN", "http://127.0.0.1:8767")
        await page.goto(f"{origin}/rv-signal/index.html")
        assert await page.get_by_role("heading", name="Right-heart function review").is_visible()
        assert await page.get_by_role("link", name="View source: published case, Table 1 ↗").is_visible()
        assert (await page.locator("tr").filter(has_text="TAPSE").inner_text()).count("20 mm") == 2
        assert "25%" in await page.locator("tr").filter(has_text="RV fractional area change").inner_text()
        assert "35%" in await page.locator("tr").filter(has_text="RV fractional area change").inner_text()
        assert await page.get_by_role("heading", name="Right ventricular cavity area across visits").is_visible()
        assert await page.get_by_role("heading", name="More signal from every heartbeat.").is_visible()
        assert await page.get_by_text("WORKING MODEL · REAL EXAMPLE VIDEOS").is_visible()
        assert await page.locator(".longitudinal-chart .visit-curve").count() == 3
        assert await page.locator(".longitudinal-chart video").count() == 0
        assert "Jan 2026" in await page.locator(".visit-legend").inner_text()
        await page.wait_for_function("document.querySelector('#usableValue').textContent.includes('/') && !document.querySelector('#demoButton').disabled", timeout=120_000)
        assert await page.locator("#demoButton").get_attribute("aria-pressed") == "true"
        assert await page.locator("#framePlaceholder").is_hidden()
        assert await page.locator("#analyzeButton").is_enabled()
        assert int((await page.locator("#usableValue").inner_text()).split(" / ")[1]) >= 15
        assert await page.locator("#changeValue").inner_text() not in {"—", "0%"}
        assert await page.locator("#playbackButton").is_enabled()
        assert await page.locator("#playbackButton").inner_text() == "Play video + AI outline"
        assert await page.locator("#playbackButton").get_attribute("data-loading") == "false"
        assert "results ready" in (await page.locator("#modelActivity").inner_text()).lower()
        assert await page.locator(".demo-section > .demo-toolbar #playbackButton").count() == 1
        assert await page.locator(".preset-tabs").evaluate("tabs => tabs.nextElementSibling.classList.contains('demo-toolbar')")
        assert await page.locator("#playbackButton").get_attribute("data-playing") == "false"
        assert await page.locator("#sourceVideo").evaluate("video => !video.controls")
        await page.locator("#playbackButton").click()
        assert await page.locator("#playbackButton").get_attribute("data-playing") == "true"
        start_frame = await page.locator("#frameScrubber").input_value()
        await page.wait_for_timeout(180)
        assert await page.locator("#frameScrubber").input_value() != start_frame, "Contours should play at video rate"
        video_time = await page.locator("#sourceVideo").evaluate("video => video.currentTime")
        contour_time = float(re.search(r"([\d.]+) s", await page.locator("#frameCounter").inner_text()).group(1))
        assert abs(video_time - contour_time) < 0.15, "Source and segmented playback must stay in sync"
        await page.locator("#frameScrubber").fill("12")
        assert (await page.locator("#frameCounter").inner_text()).startswith("Frame 13 /")
        assert await page.locator("#playbackButton").inner_text() == "Play video + AI outline"
        assert await page.locator("#playbackButton").get_attribute("data-playing") == "false"
        await page.locator("#playbackButton").click()
        await page.locator("#areaChart .data-point").last.click()
        assert await page.locator("#areaChart .data-point.selected").count() == 1

        for preset, label in [("#fluBeforeButton", "example video 2"), ("#fluAfterButton", "example video 3")]:
            await page.locator(preset).click()
            assert await page.locator("#playbackButton").get_attribute("data-loading") == "true"
            assert "EchoNet-RV" in await page.locator("#modelActivity").inner_text()
            await page.wait_for_function("!document.querySelector('#fluBeforeButton').disabled && document.querySelector('#usableValue').textContent.includes('/')", timeout=120_000)
            assert await page.locator("#playbackButton").get_attribute("data-loading") == "false"
            assert await page.locator(preset).get_attribute("aria-pressed") == "true"
            assert label in (await page.locator("#resultSubtitle").inner_text()).lower()
            assert int((await page.locator("#usableValue").inner_text()).split(" / ")[1]) >= 15
            assert await page.locator("#changeValue").inner_text() not in {"—", "0%"}

        await page.locator("#demoButton").click()
        await page.wait_for_function("!document.querySelector('#demoButton').disabled && document.querySelector('#usableValue').textContent.includes('/')", timeout=120_000)
        print("Model result:", await page.locator("#status").inner_text())
        print("Default frames:", await page.locator("#usableValue").inner_text())
        await page.screenshot(path="/private/tmp/rv-signal-desktop.png", full_page=True)

        await page.set_viewport_size({"width": 390, "height": 844})
        await page.screenshot(path="/private/tmp/rv-signal-mobile.png", full_page=True)
        overflow = await page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
        assert not overflow, "Mobile layout overflows horizontally"
        assert not errors, f"Browser errors: {errors}"
        print("PASS: automatic analysis, click-to-play synchronized video, and responsive layout")
        await browser.close()


asyncio.run(main())
