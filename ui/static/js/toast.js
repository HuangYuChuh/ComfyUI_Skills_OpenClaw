export function showToast(message, type = "success", duration = 3000) {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "i";
  toast.innerHTML = `
    <span aria-hidden="true"><strong>${icon}</strong></span>
    <span>${message}</span>
    <div class="toast-progress" style="animation-duration:${duration}ms;"></div>
  `;

  container.appendChild(toast);
  window.setTimeout(() => {
    toast.classList.add("closing");
    window.setTimeout(() => toast.remove(), 250);
  }, duration);
}
