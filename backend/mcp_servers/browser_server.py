"""Browser MCP: real browser automation via Playwright.

Uses a persistent Chromium profile so sign-ins survive restarts. Every action waits for the
page to settle and returns the current interactive elements (numbered refs) plus a
screenshot — so the agent always acts on the live page state, never a stale snapshot.

Run: python -m mcp_servers.browser_server
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from mcp.server.mcpserver import Image, MCPServer
from playwright.async_api import BrowserContext, Page, async_playwright

from mcp_servers.common import register
from mcp_servers.workspace import Workspace

mcp = MCPServer("browser", instructions="Control a real web browser.")
ws = Workspace(os.environ.get("FILE_WORKSPACE", Path.home() / "AI-Agent-Workspace"))
PROFILE_DIR = Path(os.environ.get("BROWSER_PROFILE_DIR", Path.home() / ".connecter" / "browser-profile"))
HEADLESS = os.environ.get("BROWSER_HEADLESS", "false").lower() in {"1", "true", "yes"}
MAX_TEXT = 15_000
SELECT_ALL = "Meta+A" if sys.platform == "darwin" else "Control+A"

# Tags every visible interactive element with a numeric ref so a small local model can
# say click(ref=12) instead of writing CSS selectors.
SNAPSHOT_JS = """
() => {
  const sel = 'a[href], button, input, textarea, select, [role=button], [role=link], [role=tab], [role=menuitem], [contenteditable=true]';
  document.querySelectorAll('[data-connecter-ref]').forEach(e => e.removeAttribute('data-connecter-ref'));
  const out = []; let i = 0;
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
    i += 1; el.setAttribute('data-connecter-ref', String(i));
    const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.name || el.title || '').trim().replace(/\\s+/g, ' ');
    out.push({ref: i, tag: el.tagName.toLowerCase(), type: el.type || null, label: label.slice(0, 80)});
    if (i >= 150) break;
  }
  return out;
}
"""


class BrowserState:
    def __init__(self):
        self.lock = asyncio.Lock()
        self._pw = None
        self.context: BrowserContext | None = None
        self.last_sig: str | None = None  # page signature, for "did the action change anything?"

    async def page(self) -> Page:
        if self.context is None:
            PROFILE_DIR.mkdir(parents=True, exist_ok=True)
            self._pw = await async_playwright().start()
            self.context = await self._pw.chromium.launch_persistent_context(
                str(PROFILE_DIR), headless=HEADLESS, viewport={"width": 1280, "height": 800}, accept_downloads=True
            )
            self.context.on("close", lambda _: setattr(self, "context", None))
        # Follow the most recently opened tab (handles links/logins that open a new tab).
        pages = [p for p in self.context.pages if not p.is_closed()]
        return pages[-1] if pages else await self.context.new_page()


state = BrowserState()


async def _shot(page: Page) -> Image:
    return Image(data=await page.screenshot(type="jpeg", quality=60), format="jpeg")


async def _settle(page: Page) -> None:
    """Wait for the page to finish loading — including JS-heavy SPAs — best-effort."""
    for load_state, timeout in (("domcontentloaded", 10_000), ("networkidle", 3_500)):
        try:
            await page.wait_for_load_state(load_state, timeout=timeout)
        except Exception:  # noqa: BLE001, S110 - networkidle often never fires; don't fail the action
            pass


async def _elements(page: Page) -> list[dict]:
    try:
        return await page.evaluate(SNAPSHOT_JS)
    except Exception:  # noqa: BLE001 - mid-navigation evaluate can fail; caller still has a screenshot
        return []


def _element_lines(elements: list[dict]) -> str:
    return "\n".join(
        f"[{e['ref']}] {e['tag']}{'(' + e['type'] + ')' if e['type'] else ''} {e['label']}" for e in elements
    ) or "(no interactive elements found)"


def _signature(url: str, title: str, elements: list[dict]) -> str:
    return f"{url}|{title}|" + ",".join(e.get("label", "") for e in elements[:25])


async def _act(page: Page, note: str, settle: bool = True, check_changed: bool = False) -> list:
    """Standard result of an action: a note + the LIVE interactive elements + a screenshot,
    so the agent can pick its next ref without a separate read_page. When check_changed=True
    (clicks/typing) and the page looks identical to before, warn the agent so it can recover
    instead of silently repeating a no-op."""
    if settle:
        await _settle(page)
    elements = await _elements(page)
    title = await _safe_title(page)
    sig = _signature(page.url, title, elements)
    if check_changed and state.last_sig is not None and sig == state.last_sig:
        note += (
            " — ⚠ the page did not change, so that action may not have worked. Try a different "
            "element/ref, call wait_for(...) if it's still loading, or scroll to it first."
        )
    state.last_sig = sig
    header = json.dumps({"result": note, "url": page.url, "title": title})
    return [f"{header}\n\n## Interactive elements (use the ref number)\n{_element_lines(elements)}", await _shot(page)]


async def _safe_title(page: Page) -> str:
    try:
        return await page.title()
    except Exception:  # noqa: BLE001
        return ""


def _locator(page: Page, ref: int | None, selector: str | None, text: str | None):
    if ref is not None:
        return page.locator(f'[data-connecter-ref="{int(ref)}"]')
    if selector:
        return page.locator(selector)
    if text:
        return page.get_by_text(text, exact=False)
    raise ValueError("Provide ref (from read_page), selector, or text")


@register(mcp, read_only=True)
async def open_browser(url: str | None = None) -> list:
    """Open the browser (optionally at a URL)."""
    async with state.lock:
        page = await state.page()
        if url:
            await page.goto(url, wait_until="domcontentloaded")
        return await _act(page, "browser open")


@register(mcp, read_only=True, open_world=True)
async def navigate(url: str) -> list:
    """Navigate the current tab to a URL."""
    async with state.lock:
        page = await state.page()
        if "://" not in url:
            url = "https://" + url
        await page.goto(url, wait_until="domcontentloaded")
        return await _act(page, f"navigated to {url}")


@register(mcp, read_only=True)
async def read_page() -> str:
    """Read the current page's visible text plus a numbered list of interactive elements.
    Use the numbers as `ref` in click/type. (Click/type also return this list, so you rarely
    need to call read_page twice in a row.)"""
    async with state.lock:
        page = await state.page()
        await _settle(page)
        elements = await _elements(page)
        try:
            text = await page.inner_text("body")
        except Exception:  # noqa: BLE001
            text = ""
        if len(text) > MAX_TEXT:
            text = text[:MAX_TEXT] + "\n…[truncated]"
        return (
            f"URL: {page.url}\nTitle: {await _safe_title(page)}\n\n## Text\n{text}\n\n"
            f"## Interactive elements (use the ref number)\n{_element_lines(elements)}"
        )


@register(mcp)
async def click(ref: int | None = None, selector: str | None = None, text: str | None = None) -> list:
    """Click an element by ref (from read_page), CSS selector, or visible text. If the ref is
    no longer valid the result lists the current elements so you can retry with a fresh ref."""
    async with state.lock:
        page = await state.page()
        try:
            await _locator(page, ref, selector, text).first.click(timeout=10_000)
        except Exception as e:  # noqa: BLE001
            return await _act(page, f"Could not click that element ({e.__class__.__name__}). Pick a ref from the current list below.")
        return await _act(page, "clicked", check_changed=True)


@register(mcp)
async def click_at(x: int, y: int) -> list:
    """Click at pixel coordinates (x, y) on the current page. Use this for things that aren't
    in the interactive-element list (canvas, maps, custom widgets) — typically with coordinates
    from the `look` tool. The viewport is 1280×800."""
    async with state.lock:
        page = await state.page()
        await page.mouse.click(x, y)
        return await _act(page, f"clicked at ({x}, {y})", check_changed=True)


@register(mcp)
async def drag(from_x: int, from_y: int, to_x: int, to_y: int) -> list:
    """Drag from one pixel coordinate to another (sliders, drag-and-drop, map panning)."""
    async with state.lock:
        page = await state.page()
        await page.mouse.move(from_x, from_y)
        await page.mouse.down()
        await page.mouse.move(to_x, to_y, steps=12)
        await page.mouse.up()
        return await _act(page, f"dragged ({from_x},{from_y}) → ({to_x},{to_y})")


@register(mcp)
async def type(
    text: str, ref: int | None = None, selector: str | None = None, submit: bool = False, clear: bool = True
) -> list:
    """Type text into a field by ref (from read_page) or CSS selector. Works for normal
    inputs AND rich code editors (Monaco/CodeMirror). submit=true presses Enter after;
    clear=false appends instead of replacing."""
    async with state.lock:
        page = await state.page()
        loc = _locator(page, ref, selector, None).first
        try:
            # Fast path for normal inputs/textareas.
            await loc.fill(text if clear else (await loc.input_value()) + text, timeout=4_000)
        except Exception:  # noqa: BLE001 - editors (Monaco/CodeMirror/contenteditable) reject fill()
            try:
                await loc.click(timeout=4_000)
                if clear:
                    await page.keyboard.press(SELECT_ALL)
                    await page.keyboard.press("Delete")
                await page.keyboard.type(text, delay=5)
            except Exception as e:  # noqa: BLE001 - recover gracefully instead of raising
                return await _act(
                    page,
                    f"Could not type into that element ({e.__class__.__name__}) — it may be the wrong ref or "
                    "not a text field. Pick a text input from the list below (or click it first).",
                )
        if submit:
            await loc.press("Enter")
            await _settle(page)
        return await _act(page, "typed", check_changed=not submit)


@register(mcp)
async def select_option(value: str, ref: int | None = None, selector: str | None = None) -> list:
    """Choose an option in a <select> dropdown by ref or selector. `value` matches the
    option's value OR its visible label."""
    async with state.lock:
        page = await state.page()
        loc = _locator(page, ref, selector, None).first
        try:
            await loc.select_option(value=value, timeout=5_000)
        except Exception:  # noqa: BLE001
            await loc.select_option(label=value, timeout=5_000)
        return await _act(page, f"selected {value}")


@register(mcp, read_only=True)
async def hover(ref: int | None = None, selector: str | None = None, text: str | None = None) -> list:
    """Hover over an element (reveals dropdown/flyout menus) by ref, selector, or text."""
    async with state.lock:
        page = await state.page()
        await _locator(page, ref, selector, text).first.hover(timeout=8_000)
        await asyncio.sleep(0.3)
        return await _act(page, "hovered", settle=False)


@register(mcp)
async def press_key(key: str) -> list:
    """Press a keyboard key, e.g. Enter, Escape, Tab, ArrowDown."""
    async with state.lock:
        page = await state.page()
        await page.keyboard.press(key)
        return await _act(page, f"pressed {key}")


@register(mcp, read_only=True)
async def scroll(direction: str = "down", amount: int = 800) -> list:
    """Scroll the page up or down by pixels."""
    async with state.lock:
        page = await state.page()
        await page.mouse.wheel(0, amount if direction == "down" else -amount)
        await asyncio.sleep(0.3)
        return await _act(page, f"scrolled {direction}", settle=False)


@register(mcp, read_only=True)
async def go_back() -> list:
    """Go back to the previous page in history."""
    async with state.lock:
        page = await state.page()
        await page.go_back(wait_until="domcontentloaded")
        return await _act(page, "went back")


@register(mcp, read_only=True)
async def go_forward() -> list:
    """Go forward to the next page in history."""
    async with state.lock:
        page = await state.page()
        await page.go_forward(wait_until="domcontentloaded")
        return await _act(page, "went forward")


@register(mcp, read_only=True)
async def wait_for(text: str | None = None, selector: str | None = None, seconds: int = 10) -> list:
    """Wait until some text or a selector appears on the page (for slow / dynamic content).
    Use this when a page is still loading or an element hasn't shown up yet."""
    async with state.lock:
        page = await state.page()
        try:
            if selector:
                await page.wait_for_selector(selector, timeout=seconds * 1000)
            elif text:
                await page.get_by_text(text, exact=False).first.wait_for(timeout=seconds * 1000)
            else:
                await asyncio.sleep(min(seconds, 10))
            note = "found it"
        except Exception:  # noqa: BLE001
            note = "timed out waiting; showing the current page"
        return await _act(page, note, settle=False)


@register(mcp, read_only=True)
async def screenshot() -> list:
    """Take a screenshot of the current page."""
    async with state.lock:
        page = await state.page()
        return await _act(page, "screenshot", settle=False)


@register(mcp)
async def download(ref: int | None = None, selector: str | None = None, text: str | None = None) -> str:
    """Click an element that triggers a download and save the file to the workspace 'downloads' folder."""
    async with state.lock:
        page = await state.page()
        async with page.expect_download(timeout=60_000) as info:
            await _locator(page, ref, selector, text).first.click()
        dl = await info.value
        target = ws.resolve(f"downloads/{Path(dl.suggested_filename).name}")
        target.parent.mkdir(parents=True, exist_ok=True)
        await dl.save_as(target)
        return json.dumps({"saved_to": ws.rel(target)})


@register(mcp, read_only=True)
async def request_takeover(reason: str) -> list:
    """Ask the user to take over the browser (e.g. to sign in, enter a password, pay, or solve
    a CAPTCHA). The run pauses until the user says they're done, then you continue from the
    page they leave it on. NEVER type the user's passwords yourself — hand off with this."""
    async with state.lock:
        page = await state.page()
        return await _act(page, "user finished; continue from the current page")


if __name__ == "__main__":
    mcp.run()
