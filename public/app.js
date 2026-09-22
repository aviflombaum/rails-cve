for (const button of document.querySelectorAll("[data-copy]")) {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copy);
    const status = document.getElementById("copy-status");
    try {
      await navigator.clipboard.writeText(target.value ?? target.textContent);
      status.textContent = "Copied. Ready to paste.";
    } catch {
      status.textContent = "Clipboard access is unavailable. Select and copy the text below.";
      const details = target.closest("details");
      if (details) details.open = true;
      if (target.select) target.select();
      else {
        const range = document.createRange();
        range.selectNodeContents(target);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  });
}
for (const form of document.querySelectorAll("form[data-confirm]")) {
  form.addEventListener("submit", (e) => {
    if (!window.confirm(form.dataset.confirm)) e.preventDefault();
  });
}
