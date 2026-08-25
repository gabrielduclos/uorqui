let queued = false;

function enhanceMentionLabels() {
  queued = false;
  document.querySelectorAll<HTMLElement>(".uorqui-mention-option").forEach((option) => {
    if (option.dataset.uorquiNameLabel === "1") return;
    const small = option.querySelector<HTMLElement>(".uorqui-mention-copy small");
    if (!small) return;
    const text = small.textContent || "";
    const parts = text.split(" · ");
    if (parts.length > 1 && parts[1]) small.textContent = parts.slice(1).join(" · ");
    else small.textContent = "";
    option.dataset.uorquiNameLabel = "1";
  });
}

function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(enhanceMentionLabels);
}

const observer = new MutationObserver(queue);
observer.observe(document.documentElement, { childList: true, subtree: true });
queue();
