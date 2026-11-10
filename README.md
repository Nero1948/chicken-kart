# Chicken Kart

A browser-based 3D kart racing game starring chickens. Built with plain
JavaScript and [Three.js](https://threejs.org/) loaded straight from a CDN, so
there is no build step and nothing to install: it is just static HTML, CSS and
JavaScript.

Play it live: **[chicken-kart.vercel.app](https://chicken-kart.vercel.app)**

## Tracks

- **Funny Farm** - a dirt loop with a barn, an underground tunnel, a jump ramp,
  wandering chickens, a stubborn cow and a muddy hairpin.
- **Chickens in the City** - an Auckland circuit with the Sky Tower, a city
  skyline, and a drive up and over the Auckland Harbour Bridge across the
  harbour.
- **Tongariro Park** - an off-road volcanic loop with three jump ramps.
- **Chickens in Tokyo** - the longest lap, crossing over itself at two
  intersections, with a cloverleaf ramp and Mt Fuji on the horizon.
- **Mt Maunganui Beach** - the tight, technical seaside circuit.

Modes: Single Race, Daily Time Trial (with a ghost of your best run), Grand
Prix (five races, points) and Elimination (last place is knocked out each
round). Difficulty runs from Easy to Extreme.

## Controls

- **Arrows / WASD** - drive
- **Shift** (or **X** / **K**) - hop and drift
- **Space** (or **E**) - use item
- **Esc** (or **P**) - pause
- A gamepad works too: stick to steer, A to accelerate, B to brake, right
  bumper to drift, left bumper for the item, Start to pause.
- On touch devices, on-screen buttons appear while racing.

## Racing tricks

- **Rocket start** - press accelerate just as the "1" fades. Too early and the
  wheels spin.
- **Drift** - hold the drift button while steering to slide. Sparks go blue,
  orange, then pink; let go for a mini-turbo that matches the colour.
- **Tricks** - tap drift as you leave a ramp for a boost when you land.
- **Slipstream** - sit right behind a rival for a second to be slung past.
- **Golden corn** - each cob adds a little top speed (up to 10). Crash and you
  drop three.
- **Boost pads** - glowing arrows on the road give a burst of speed.

## Items

Crack a mystery egg to roll an item. The further back you are running, the
better your luck: leaders get mines and shields, back-markers get the big
comeback items.

- ⚡ **Boost** - a burst of speed (it also powers through grass and mud)
- 🥚 **Egg shot** - flies straight and bounces off the fences
- 🚀 **Missile** - homes in on the racer ahead
- 💣 **Mine** - dropped behind you
- 🛡️ **Shield** - an eggshell bubble that soaks up one hit
- 🌶️ **Chilli** - red-hot: fast, invincible, and bashes rivals aside
- 🐓 **Rooster crow** - startles every racer ahead of you
- 🦙 **Toy llama** - only from the sparkly pink eggs

## Running locally

It is a static site, so any local web server works. For example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout

- `index.html` - page shell, menus and HUD
- `css/style.css` - all UI styling
- `js/track.js` - the track registry: loop geometry, scenery, kerbs, boost pads
- `js/main.js` - scene setup, menus, the chase camera and the main game loop
- `js/kart.js` - kart physics (drift, tricks, slipstream) and the 3D models
- `js/ai.js` - the rival AI drivers
- `js/items.js` - mystery eggs, corn, every item, and the particle effects
- `js/gfx.js` - sky, bloom glow and the racer portraits
- `js/race.js` - countdown, laps, checkpoints and standings
- `js/chickens.js`, `js/cow.js`, `js/moa.js` - the animals on the track
- `js/hud.js`, `js/audio.js`, `js/player.js` - HUD, synthesised sound, input
- `js/daily.js`, `js/ghost.js`, `js/records.js`, `js/unlocks.js` - the daily
  time trial, ghost replays, lap records and unlockable racers

## Testing tips

- Add `?auto` to the URL and your kart drives itself (handy for watching a race).
- Add `?nobloom` to switch off the glow effect on a slow computer. The game
  also does this by itself if the framerate drops.
