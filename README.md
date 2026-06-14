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

Pick your track and difficulty (Easy / Medium / Hard) from the home menu.

## Controls

- **Arrows / WASD** - drive
- **Space** - use item
- On touch devices, on-screen buttons appear while racing.

## Items

Drive through item boxes to collect a random item: a speed boost, a homing
missile, a dropped mine, or - from the sparkly pink boxes - a galloping toy
llama. Jump the ramp to leap over rivals, and watch out for the animals on the
road.

## Running locally

It is a static site, so any local web server works. For example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project layout

- `index.html` - page shell, menus and HUD
- `css/style.css` - all UI styling
- `js/track.js` - the track registry: loop geometry, scenery and both tracks
- `js/main.js` - scene setup, menus and the main game loop
- `js/kart.js` - kart physics and the chicken/kart 3D models
- `js/ai.js` - the rival AI drivers
- `js/items.js` - item boxes, mines, missiles, boosts and the toy llama
- `js/race.js` - countdown, laps, checkpoints and standings
- `js/chickens.js`, `js/cow.js` - the animals that cross and block the track
- `js/hud.js`, `js/audio.js`, `js/player.js` - HUD, synthesised sound, input
