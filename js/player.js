// Player input for the kart: keyboard on desktop, on-screen buttons on touch
// devices, and a gamepad if one is plugged in. All three feed the same `input`
// object every frame.

const keys = {};
let firePressed = false;
let pausePressed = false;
const touch = { left: false, right: false, gas: false, brake: false, drift: false };
const padPrev = { item: false, pause: false };

export const input = { throttle: 0, steer: 0, brake: 0, drift: false };

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'KeyE') firePressed = true;
    if (e.code === 'Escape' || e.code === 'KeyP') pausePressed = true;
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  // If the window loses focus (alt-tab, clicking away), any held key's `keyup`
  // never arrives, leaving that key stuck "down" forever. A stuck ArrowRight
  // would cancel out every left turn, pinning the kart to the rail. Clearing
  // all keys on blur (and again on focus) guarantees no key can stay falsely
  // held.
  const clearKeys = () => {
    for (const code in keys) keys[code] = false;
  };
  window.addEventListener('blur', clearKeys);
  window.addEventListener('focus', clearKeys);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearKeys();
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

// Read the first connected gamepad (standard layout): left stick or d-pad to
// steer, A / right trigger to accelerate, B / left trigger to brake, right
// bumper or X to drift, left bumper or Y for the item, Start to pause.
function readGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) {
    if (!gp || !gp.connected) continue;
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    let steer = 0;
    const ax = gp.axes[0] || 0;
    if (Math.abs(ax) > 0.18) steer = -ax;
    if (b(14)) steer = 1;
    if (b(15)) steer = -1;
    const item = b(4) || b(3);
    const pause = b(9);
    if (item && !padPrev.item) firePressed = true;
    if (pause && !padPrev.pause) pausePressed = true;
    padPrev.item = item;
    padPrev.pause = pause;
    return { steer, gas: b(0) || b(7), brake: b(1) || b(6), drift: b(5) || b(2) };
  }
  return null;
}

export function updateInput() {
  const pad = readGamepad();
  input.throttle = (keys.ArrowUp || keys.KeyW || touch.gas || (pad && pad.gas)) ? 1 : 0;
  input.brake = (keys.ArrowDown || keys.KeyS || touch.brake || (pad && pad.brake)) ? 1 : 0;
  // Positive steer turns left, matching the physics convention
  input.steer = ((keys.ArrowLeft || keys.KeyA || touch.left) ? 1 : 0)
    - ((keys.ArrowRight || keys.KeyD || touch.right) ? 1 : 0);
  if (pad && input.steer === 0) input.steer = pad.steer;
  // Drift has spare keys (X, K) because hammering Shift can trigger the
  // Sticky Keys pop-up on Windows.
  input.drift = !!(keys.ShiftLeft || keys.ShiftRight || keys.KeyX || keys.KeyK || touch.drift || (pad && pad.drift));
}

// Returns true once per item press
export function consumeFire() {
  const f = firePressed;
  firePressed = false;
  return f;
}

// Returns true once per pause press (Esc, P or the gamepad Start button)
export function consumePause() {
  const p = pausePressed;
  pausePressed = false;
  return p;
}
