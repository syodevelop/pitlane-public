(() => {
  let shown = false;
  function failed() {
    if (shown || document.documentElement.dataset.appReady === "true") return;
    shown = true;
    const box = document.createElement("aside");
    box.className = "boot-notice";
    box.setAttribute("role", "alert");
    const text = document.createElement("p");
    text.textContent = "The page could not finish loading. Check your connection and reload to try again.";
    const retry = document.createElement("a");
    retry.href = ""; retry.textContent = "Reload page";
    const contact = document.createElement("a");
    contact.href = "https://x.com/playpitlane"; contact.textContent = "Contact on X";
    box.append(text, retry, contact); document.body.append(box);
  }
  window.addEventListener("error", event => { if (event.target instanceof HTMLScriptElement && event.target.type === "module") failed(); }, true);
  window.setTimeout(failed, 15000);
})();
