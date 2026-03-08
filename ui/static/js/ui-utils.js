export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function setBusy(target, isBusy) {
  const $target = target.jquery ? target : window.jQuery(target);
  $target.prop("disabled", isBusy);
  $target.attr("data-loading", String(isBusy));
}

export function scrollToElement(target, offset = 0) {
  const $target = target.jquery ? target : window.jQuery(target);
  if (!$target.length) {
    return;
  }

  const top = Math.max(($target.offset()?.top || 0) - offset, 0);
  window.scrollTo({ top, behavior: "smooth" });
}
