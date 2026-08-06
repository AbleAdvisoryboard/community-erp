let __toastEl;
let __toastTimer;

export function showToast(message, type = "info", ms = 3000) {
  if (!__toastEl) {
    __toastEl = document.querySelector("[data-toast]");
  }
  if (!__toastEl) {
    __toastEl = document.createElement("div");
    __toastEl.className = "toast";
    __toastEl.setAttribute("data-toast", "");
    document.body.appendChild(__toastEl);
  }

  __toastEl.textContent = message;
  __toastEl.classList.remove("toast--ok", "toast--err");

  const normalizedType = typeof type === "string" ? type.toLowerCase() : "info";
  if (normalizedType === "err" || normalizedType === "error") {
    __toastEl.classList.add("toast--err");
  } else {
    __toastEl.classList.add("toast--ok");
  }

  __toastEl.classList.add("is-visible");
  if (__toastTimer) {
    clearTimeout(__toastTimer);
  }
  __toastTimer = setTimeout(() => {
    __toastEl.classList.remove("is-visible");
  }, ms);
}
