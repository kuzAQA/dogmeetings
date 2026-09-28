function keepElementVisibleInViewport(element: HTMLElement, viewport: VisualViewport) {
  const bounds = element.getBoundingClientRect();
  const bottom = viewport.height - 12;
  const offset = bounds.bottom > bottom ? bounds.bottom - bottom : bounds.top < 0 ? bounds.top : 0;
  if (!offset) return;
  window.scrollBy({ top: offset, behavior: "auto" });
}

export function keepActionVisibleAfterFocus(focusedElement: HTMLElement, action: HTMLElement | null) {
  const viewport = window.visualViewport;
  if (!viewport || !action || !window.matchMedia("(max-width: 899px)").matches) return;
  const controller = new AbortController();
  let animationFrame = 0;
  const stop = () => {
    cancelAnimationFrame(animationFrame);
    controller.abort();
  };
  const keepActionVisible = () => {
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(() => {
      if (!controller.signal.aborted && action.isConnected) keepElementVisibleInViewport(action, viewport);
    });
  };
  focusedElement.addEventListener("blur", stop, { once: true });
  viewport.addEventListener("resize", keepActionVisible, { signal: controller.signal });
  window.addEventListener("pointerdown", stop, { passive: true, signal: controller.signal });
  window.addEventListener("wheel", stop, { passive: true, signal: controller.signal });
  keepActionVisible();
}
