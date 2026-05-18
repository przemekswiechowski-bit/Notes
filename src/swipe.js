import { shouldArchiveSwipe } from "./core.js";

export function attachSwipe(card, onArchive) {
  let startX = 0;
  let startY = 0;
  let dragging = false;

  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    startX = event.clientX;
    startY = event.clientY;
    dragging = true;
    card.setPointerCapture(event.pointerId);
  });

  card.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const deltaX = Math.max(0, event.clientX - startX);
    if (deltaX > 8) {
      card.style.transform = `translateX(${Math.min(deltaX, 120)}px)`;
      card.style.opacity = String(Math.max(0.5, 1 - deltaX / 260));
    }
  });

  card.addEventListener("pointerup", (event) => {
    if (!dragging) return;
    dragging = false;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    card.style.transform = "";
    card.style.opacity = "";
    if (shouldArchiveSwipe({ deltaX, deltaY })) onArchive();
  });

  card.addEventListener("pointercancel", () => {
    dragging = false;
    card.style.transform = "";
    card.style.opacity = "";
  });
}
