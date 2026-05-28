<p align="center">
  <img src="https://img.shields.io/endpoint?url=https://foundryshields.com/version?url=https://raw.githubusercontent.com/Arga-Mods/argas-benny-and-wound-panel-swade/main/module.json" alt="Foundry Version">
  <a href="https://github.com/Arga-Mods/argas-benny-and-wound-panel-swade/releases/latest"><img src="https://img.shields.io/github/v/release/Arga-Mods/argas-benny-and-wound-panel-swade?display_name=tag&sort=semver&label=Latest%20Release&color=4287f5" alt="Latest Release"></a>
  <a href="https://forge-vtt.com/bazaar#package=argas-benny-and-wound-panel-swade"><img src="https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https://forge-vtt.com/api/bazaar/package/argas-benny-and-wound-panel-swade&colorB=4aa94a" alt="Forge Installs"></a>
  <a href="https://github.com/Arga-Mods/argas-benny-and-wound-panel-swade/releases"><img src="https://img.shields.io/github/downloads/Arga-Mods/argas-benny-and-wound-panel-swade/total?label=Downloads%20%28Total%29&color=4aa94a" alt="Downloads Total"></a>
  <a href="https://github.com/Arga-Mods/argas-benny-and-wound-panel-swade/releases/latest"><img src="https://img.shields.io/github/downloads/Arga-Mods/argas-benny-and-wound-panel-swade/latest/total?label=Downloads%20%28Latest%29&color=f5a623" alt="Downloads Latest"></a>
</p>


# Arga's Benny & Wound Panel [SWADE]

A floating widget for Savage Worlds Adventure Edition (SWADE) that lets you adjust

- Bennies
- Wounds, and
- Fatigue

on selected tokens without ever opening a character sheet. The module automatically detects the token type (character, NPC, group, vehicle) and adjusts the available controls accordingly.

<p align="center">
  <img src="screenshots/benny-panel_dock.png" alt="docked widget" width="200">
</p>

## Moving the Widget

Grab the widget with the right mouse button and drag it wherever you like. Its position is saved and restored on reload.

There are two fixed docking points: the **Active Players** window (bottom-left) and the **Scene Navigation Bar** (top-left). As the widget approaches either of these areas, it will wiggle to indicate a valid dock position — release it there and it snaps into place, following along whenever those panels expand or collapse.

Outside of dock zones, the widget will snap to the hotbar, the sidebar, or the edges of the canvas.

If **Arga's Day-Night Slider** is also installed, the slider becomes an additional docking point (see below).

<br>

## Minimizing the Widget

Double-click any of the three icons (Bennies, Wounds, Fatigue) to collapse the widget into a small compact icon. The compact icon can be dragged around independently with the right mouse button, and double-clicking it restores the full widget.

<p align="center">
  <img src="screenshots/benny-panel_compact.png" alt="compact icon" width="200">
</p>

The compact icon remembers its own position separately from the widget. If you are short on space, the compact icon can also be displayed vertically — toggle this in the module settings.

## Settings & Appearance

The widget automatically adapts to UI scaling, the faded-UI setting, and light or dark interface themes. Beyond that, a number of options can be configured in the Game Settings, including whether chat messages should be detailed, brief, or turned off entirely. Disabling chat output is a GM-only setting.

<p align="center">
  <img src="screenshots/benny-panel_simple.png" alt="Simple Chat Message" width="300">
  &nbsp;&nbsp;<em>or</em>&nbsp;&nbsp;
  <img src="screenshots/benny-panel_detailed.png" alt="Detailed Chat Message" width="300">
</p>

## Languages

The module is currently available in English and German.

## Compatibility with Other Modules

- **Arga's Day-Night Slider** — The two widgets dock to each other and move together when a shared docking point expands (e.g. the Scene Navigation Bar).
- **Dice So Nice** — Spending and receiving Bennies triggers a DSN dice animation.
  
---

## My Other Modules
If you like ***Arga's Benny & Wound Panel [SWADE]***, feel free to check out my other modules as well:

* **[Arga's Day-Night Slider](https://github.com/Arga-Mods/argas-day-night-slider)** – A slider for a smooth day/night transition in your scenes.
* **[Arga's Dice Roller](https://github.com/Arga-Mods/argas-dice-roller)** – A system-agnostic dice module with a Fate Roll function and additional features and dice mechanics for the **Savage Worlds Adventure Edition (SWADE)** game system, such as Critical Failures, Benny rerolls, Request Rolls, and Dramatic Tasks.

---

<p align="center"><em>Enjoy — Arga</em></p>
