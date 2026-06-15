// Player input for the kart: keyboard on desktop, on-screen buttons on touch
// devices. Both feed the same `input` object every frame.

const keys = {};
let firePressed = false;
const touch = { left: false, right: false, gas: false, brake: false, drift: false };

export const input = { throttle: 0, steer: 0, brake: 0, drift: 0 };

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    // Alt is the drift key; stop the browser from stealing focus to its menu
    if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Space') firePressed = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
}

// Wire up the on-screen touch buttons. Each button holds its action while
// pressed; the item button fires once per tap. Pointer capture keeps a button
// "held" even if the thumb slides slightly off it.
export function initTouch() {
  const root = document.getElementById('touch');
  if (!root) return;
  root.querySelectorAll('.tbtn').forEach((btn) => {
    const act = btn.dataset.act;
    const set = (down) => {
      if (act === 'item') { if (down) firePressed = true; return; }
      touch[act] = down;
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch {}
      btn.classList.add('pressed');
      set(true);
    });
    const release = () => { btn.classList.remove('pressed'); set(false); };
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

export function updateInput() {
  input.throttle = (keys.ArrowUp || keys.KeyW || touch.gas) ? 1 : 0;
  input.brake = (keys.ArrowDown || keys.KeyS || touch.brake) ? 1 : 0;
  // Positive steer turns left, matching the physics convention
  input.steer = ((keys.ArrowLeft || keys.KeyA || touch.left) ? 1 : 0)
    - ((keys.ArrowRight || keys.KeyD || touch.right) ? 1 : 0);
  input.drift = (keys.AltLeft || keys.AltRight || touch.drift) ? 1 : 0;
}

// Returns true once per space bar press
export function consumeFire() {
  const f = firePressed;
  firePressed = false;
  return f;
}
