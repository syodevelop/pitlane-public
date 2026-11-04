// Preserve the reading page's width while a menu or dialog hides its scrollbar.
// Reserving a gutter on <html> instead would also shrink viewport units.
export function reserveScrollbarSpace() {
  if (
    document.querySelector(
      '.site-header[data-menu-open="true"], .play-notice[open]',
    )
  )
    return;
  document.documentElement.style.setProperty(
    "--site-scrollbar-width",
    `${window.innerWidth - document.documentElement.clientWidth}px`,
  );
}
