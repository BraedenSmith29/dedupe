function newTabClick(e: PointerEvent) {
  const target = e.target;
  if (!target || !(target instanceof Element)) return;

  const link = target.closest('a');
  if (!link || !link.href) return;

  const isCtrlClick = e.button === 0 && e.ctrlKey;
  const isMiddleClick = e.button === 1;
  const isNewTabClick = isCtrlClick || isMiddleClick;
  if (!isNewTabClick) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // Send message to background script to check tabs
  browser.runtime.sendMessage({
    action: 'handleManualNewTabRedirect',
    url: link.href
  });
}

document.addEventListener('click', newTabClick, true);
document.addEventListener('auxclick', newTabClick, true);
