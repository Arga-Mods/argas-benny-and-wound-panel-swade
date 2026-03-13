// panel.js – Arga's Benny & Wound Panel
// Kompatibel mit Foundry v13 und v14.

const MODULE_ID = 'argas-benny-and-wound-panel-swade';
const UI_ID     = 'argas-panel-ui';
const EDGE_MARGIN = 15;     // Mindestabstand zum Browserfenster-Rand (px)
const SNAP_THRESHOLD = 18;  // Einrastdistanz in Pixel
const SNAP_GAP = 15;       // Abstand zum Snap-Ziel in Pixel
const DOCK_ZONE = 80;       // Fangbereich für Docking in Pixel
const DOCK_GAP = 13;        // Abstand zum Dock-Ziel in Pixel (skaliert mit UI-Scale)

let uiContainer;
let spacerElement = null;
let iconElement   = null;   // Das Collapse-Icon (all-in-one.png).
let iconImg       = null;   // Das <img> innerhalb des Collapse-Icon-Wrappers.
let isCollapsed   = false;  // Aktueller Kollabiert-Zustand.
let isDragging = false;       // Modul-weit, damit Observer den Drag nicht stören.
let _pushedBySidebar = false;  // Widget wurde von der Sidebar weggedrückt (Originalposition wiederherstellen).
let _snappedToSidebar = false; // Widget wurde absichtlich an der Sidebar platziert (mitbewegen beim Zuklappen).
let _isRespondingToSiblingMove = false; // Verhindert Endlosschleifen beim Widget-zu-Widget-Sync.
let _justDocked = false; // Unterdrückt Event-Dispatch direkt nach eigenem Dock-Vorgang.
let _iconPreSidebarX = null; // Merkt sich die Icon-Position vor dem Sidebar-Push.

/* ------------------------------------------------------------------ */
/*  Collapse / Expand                                                 */
/* ------------------------------------------------------------------ */

/**
 * Wendet die iconVertical-Einstellung auf das Collapse-Icon an.
 * Tauscht Bildquelle und Dimensionen – kein Reload nötig.
 */
function applyIconVertical() {
  if (!iconImg) return;
  const vertical = game.settings.get(MODULE_ID, 'iconVertical');
  iconImg.src          = vertical
    ? `modules/${MODULE_ID}/assets/all-in-one-rotated.png`
    : `modules/${MODULE_ID}/assets/all-in-one.png`;
  iconImg.style.width  = vertical ? '32px' : '72px';
  iconImg.style.height = vertical ? '72px' : '32px';
}

/**
 * Kollabiert das Panel: uiContainer wird versteckt, das Collapse-Icon
 * erscheint an der gespeicherten (oder abgeleiteten) Position.
 * Während des kollabierten Zustands unterdrücken Sync-Funktionen ihre
 * Arbeit; beim Expand wird die Dock-Position einmalig neu synchronisiert.
 */
function collapsePanel(saveState = true) {
  if (!uiContainer || !iconElement || isCollapsed) return;
  isCollapsed = true;

  // Visuelle Position des Panels vor dem Verstecken merken (Icon-Fallback).
  const panelRect = uiContainer.getBoundingClientRect();

  uiContainer.style.display = 'none';

  // Icon positionieren.
  let iconTarget = 'none';
  try { iconTarget = game.settings.get(MODULE_ID, 'iconDockTarget'); } catch (_) {}

  if (iconTarget !== 'none') {
    // Icon hat eigenes Dock-Ziel → dorthin positionieren.
    iconElement.style.display = 'block';
    void iconElement.offsetHeight; // Reflow: Browser registriert Startzustand für faded-ui-Transition
    syncIconPosition(iconTarget);
  } else {
    // Frei → gespeicherte Icon-Position oder Fallback an Panel-Position.
    let savedIconPos = { top: null, left: null };
    try { savedIconPos = game.settings.get(MODULE_ID, 'iconPosition') ?? savedIconPos; } catch (_) {}
    if (savedIconPos.top != null && savedIconPos.left != null) {
      iconElement.style.top  = `${savedIconPos.top}px`;
      iconElement.style.left = `${savedIconPos.left}px`;
    } else {
      iconElement.style.top  = `${panelRect.top}px`;
      iconElement.style.left = `${Math.round(panelRect.left + panelRect.width / 2 - 36)}px`;
    }
    iconElement.style.display = 'block';
    void iconElement.offsetHeight; // Reflow: Browser registriert Startzustand für faded-ui-Transition
  }

  if (saveState) {
    game.settings.set(MODULE_ID, 'collapsed', true).catch(() => {});
  }
}

/**
 * Stellt das Panel wieder her: Icon wird versteckt, uiContainer erscheint
 * wieder und die Dock-Position wird einmalig neu synchronisiert.
 */
function expandPanel(saveState = true) {
  if (!uiContainer || !iconElement || !isCollapsed) return;
  isCollapsed = false;

  iconElement.style.display = 'none';
  uiContainer.style.display = '';

  // Dock-Position neu synchronisieren (CSS-Werte sind noch korrekt gesetzt,
  // aber ein einmaliger Sync stellt sicher, dass alles stimmt).
  try {
    const target = game.settings.get(MODULE_ID, 'dockTarget');
    if (target !== 'none') syncDockPosition();
  } catch (_) {}

  if (saveState) {
    game.settings.set(MODULE_ID, 'collapsed', false).catch(() => {});
  }
}

Hooks.on('ready', () => {
  const isGM             = game.user.isGM;
  const isAssistant      = game.user.role === CONST.USER_ROLES.ASSISTANT;
  const visibleToPlayers = game.settings.get(MODULE_ID, 'visibleToPlayers');
  const isDisabled       = game.settings.get(MODULE_ID, 'disabledLocally');
  if (!isGM && !isAssistant && !visibleToPlayers) return;
  if (isDisabled) return;
  initPanel();
});

/* ------------------------------------------------------------------ */
/*  UI-Scale                                                          */
/* ------------------------------------------------------------------ */

function applyUiScale() {
  if (!uiContainer) return;
  const scale = getUiScale();
  // transformOrigin wird von der Dock-Logik gesetzt
  // ('left bottom' für Players, 'left top' für Navigation/frei).
  if (!uiContainer.style.transformOrigin) {
    uiContainer.style.transformOrigin = 'left top';
  }
  uiContainer.style.transform = `scale(${scale})`;
}

function getUiScale() {
  const uiScaleEl = document.getElementById('ui-top')?.closest('[style*="--ui-scale"]');
  if (!uiScaleEl) return 1;
  return parseFloat(getComputedStyle(uiScaleEl).getPropertyValue('--ui-scale')) || 1;
}

/* ------------------------------------------------------------------ */
/*  Viewport-Clamping                                                 */
/* ------------------------------------------------------------------ */

function clampToViewport(x, y) {
  const scale = getUiScale();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const panelW = uiContainer.offsetWidth * scale;
  const panelH = uiContainer.offsetHeight * scale;

  return {
    x: Math.round(Math.max(EDGE_MARGIN, Math.min(vw - panelW - EDGE_MARGIN, x))),
    y: Math.round(Math.max(EDGE_MARGIN, Math.min(vh - panelH - EDGE_MARGIN, y)))
  };
}

/* ------------------------------------------------------------------ */
/*  Snap-Logik                                                        */
/* ------------------------------------------------------------------ */

function getSnapTargets() {
  const targets = [];
  // IDs der Dock-Anker ausschließen – ihre Positionierung wird über die Dock-Logik gehandhabt.
  const dockIds = new Set([
    'players', 'players-active', 'players-inactive',
    'scene-navigation', 'scene-navigation-active', 'scene-navigation-inactive'
  ]);

  document.querySelectorAll('.window-app').forEach(el => {
    if (el.style.display === 'none') return;
    targets.push(el.getBoundingClientRect());
  });
  for (const id of ['sidebar', 'hotbar', 'scene-navigation', 'controls', 'players']) {
    if (dockIds.has(id)) continue;
    const el = document.getElementById(id);
    if (el) targets.push(el.getBoundingClientRect());
  }
  return targets;
}

function rangesOverlap(aMin, aMax, bMin, bMax) {
  return aMax > bMin && aMin < bMax;
}

function snapPosition(x, y, panelW, panelH) {
  const targets = getSnapTargets();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let sx = x, sy = y;
  let bestDx = SNAP_THRESHOLD, bestDy = SNAP_THRESHOLD;

  if (Math.abs(x - EDGE_MARGIN) < SNAP_THRESHOLD)                     { sx = EDGE_MARGIN; bestDx = 0; }
  if (Math.abs(x + panelW - (vw - EDGE_MARGIN)) < SNAP_THRESHOLD)     { sx = vw - panelW - EDGE_MARGIN; bestDx = 0; }
  if (Math.abs(y - EDGE_MARGIN) < SNAP_THRESHOLD)                     { sy = EDGE_MARGIN; bestDy = 0; }
  if (Math.abs(y + panelH - (vh - EDGE_MARGIN)) < SNAP_THRESHOLD)     { sy = vh - panelH - EDGE_MARGIN; bestDy = 0; }

  for (const t of targets) {
    const overlapH = rangesOverlap(y, y + panelH, t.top, t.bottom);
    const overlapV = rangesOverlap(x, x + panelW, t.left, t.right);

    if (overlapH) {
      const edges = [
        { dist: Math.abs(x - (t.right + SNAP_GAP)),          val: t.right + SNAP_GAP },
        { dist: Math.abs(x + panelW - (t.left - SNAP_GAP)),  val: t.left - panelW - SNAP_GAP },
        { dist: Math.abs(x - t.left),                        val: t.left },
        { dist: Math.abs(x + panelW - t.right),              val: t.right - panelW }
      ];
      for (const e of edges) if (e.dist < bestDx) { bestDx = e.dist; sx = e.val; }
    }
    if (overlapV) {
      const edges = [
        { dist: Math.abs(y - (t.bottom + SNAP_GAP)),          val: t.bottom + SNAP_GAP },
        { dist: Math.abs(y + panelH - (t.top - SNAP_GAP)),    val: t.top - panelH - SNAP_GAP },
        { dist: Math.abs(y - t.top),                          val: t.top },
        { dist: Math.abs(y + panelH - t.bottom),              val: t.bottom - panelH }
      ];
      for (const e of edges) if (e.dist < bestDy) { bestDy = e.dist; sy = e.val; }
    }
  }
  return { x: sx, y: sy };
}

/* ------------------------------------------------------------------ */
/*  Spacer-Logik für Players-Docking                                  */
/* ------------------------------------------------------------------ */

/**
 * Gibt das DOM-Element zurück, VOR dem der Spacer im DOM-Flow
 * eingefügt werden soll. Wenn inaktive Spieler sichtbar sind,
 * ist der Anker #players-inactive, sonst #players-active.
 */
function getPlayersPinAnchor() {
  const inactive = document.getElementById('players-inactive');
  if (inactive && inactive.offsetHeight > 20) return inactive;
  return (
    document.getElementById('players-active') ||
    document.getElementById('players') ||
    document.getElementById('players-inactive')
  );
}

/**
 * Stellt sicher, dass der Spacer im DOM-Flow von #players
 * direkt vor dem Pin-Anker sitzt.
 */
function ensureSpacerInFlow() {
  if (!spacerElement) return;
  const anchor = getPlayersPinAnchor();
  if (!anchor) return;
  if (spacerElement.nextElementSibling !== anchor) {
    anchor.insertAdjacentElement('beforebegin', spacerElement);
  }
}

/**
 * Positioniert das Panel relativ zum Spacer (Players-Docking).
 * Nutzt bottom-Positionierung, damit das Panel automatisch
 * mit dem DOM-Flow von #players mitfährt.
 */
function syncPanelToSpacer() {
  if (!uiContainer || !spacerElement?.isConnected) return;
  const sr    = spacerElement.getBoundingClientRect();
  const scale = getUiScale();
  const gap   = DOCK_GAP * scale;
  uiContainer.style.left            = `${sr.left}px`;
  uiContainer.style.top             = '';
  uiContainer.style.bottom          = `${window.innerHeight - sr.top + gap}px`;
  uiContainer.style.transformOrigin = 'left bottom';
}

/* ------------------------------------------------------------------ */
/*  Dock-Logik                                                        */
/* ------------------------------------------------------------------ */

/**
 * Gibt das DOM-Anker-Element für ein Dock-Ziel zurück.
 * 'players'    → #players (unten links)
 * 'navigation' → dynamisch: zugeklappt → #scene-navigation-active,
 *                aufgeklappt → letztes <li> in #scene-navigation-inactive
 */
function getDockAnchor(target) {
  if (target === 'players') {
    return document.getElementById('players');
  }
  if (target === 'navigation') {
    const nav = document.getElementById('scene-navigation');
    if (nav?.classList.contains('expanded')) {
      const inactive = document.getElementById('scene-navigation-inactive');
      const lastLi = inactive?.querySelector('li:last-child');
      if (lastLi) return lastLi;
    }
    return document.getElementById('scene-navigation-active');
  }
  return null;
}

/**
 * Positioniert das Collapse-Icon an einem Dock-Ziel.
 * Analogon zu syncDockPosition(), aber für das Icon (top/left statt bottom).
 */
function syncIconPosition(target) {
  if (!iconElement) return;
  const scale = getUiScale();
  const gap   = DOCK_GAP * scale;
  const iconH = iconElement.offsetHeight || 32;

  if (target === 'players') {
    ensureSpacerInFlow();
    if (!spacerElement?.isConnected) return;
    const sr = spacerElement.getBoundingClientRect();
    iconElement.style.left = `${sr.left}px`;
    iconElement.style.top  = `${sr.top - iconH - gap}px`;
  } else if (target === 'navigation') {
    const anchor = getDockAnchor(target);
    if (!anchor) return;
    const ar = anchor.getBoundingClientRect();
    iconElement.style.left = `${ar.left}px`;
    iconElement.style.top  = `${ar.bottom + gap}px`;
  } else if (target === 'widget-dns-above') {
    const dns = window.ArgasMods?.dayNightSlider;
    if (!dns?.isConnected) return;
    const dr = dns.getBoundingClientRect();
    iconElement.style.left = `${dr.left}px`;
    iconElement.style.top  = `${dr.top - iconH - 5}px`;
  } else if (target === 'widget-dns-below') {
    const dns = window.ArgasMods?.dayNightSlider;
    if (!dns?.isConnected) return;
    const dr = dns.getBoundingClientRect();
    iconElement.style.left = `${dr.left}px`;
    iconElement.style.top  = `${dr.bottom + 5}px`;
  }
}

/**
 * Positioniert das Panel relativ zum Dock-Ziel.
 * - players:    links bündig, direkt über dem Players-Element
 * - navigation: links bündig, direkt unter dem Navigation-Element
 */
function syncDockPosition() {
  if (!uiContainer?.isConnected) return;
  if (isDragging) return;  // Nicht während des Drags synchronisieren.
  if (isCollapsed) {
    // Im kollabierten Zustand das Icon an seinem eigenen Dock-Ziel nachziehen.
    const iconTarget = game.settings.get(MODULE_ID, 'iconDockTarget');
    if (iconTarget !== 'none') syncIconPosition(iconTarget);
    return;
  }
  const target = game.settings.get(MODULE_ID, 'dockTarget');
  if (target === 'none') return;

  if (target === 'players') {
    ensureSpacerInFlow();
    syncPanelToSpacer();
  } else if (target === 'navigation') {
    const anchor = getDockAnchor(target);
    if (!anchor) return;
    const ar    = anchor.getBoundingClientRect();
    const scale = getUiScale();
    const gap   = DOCK_GAP * scale;
    uiContainer.style.left            = `${ar.left}px`;
    uiContainer.style.top             = `${ar.bottom + gap}px`;
    uiContainer.style.bottom          = '';
    uiContainer.style.transformOrigin = 'left top';
  } else if (target === 'widget-dns-above' || target === 'widget-dns-below') {
    const dns = window.ArgasMods?.dayNightSlider;
    if (!dns?.isConnected) return;
    const dr    = dns.getBoundingClientRect();
    if (target === 'widget-dns-above') {
      uiContainer.style.left            = `${dr.left}px`;
      uiContainer.style.bottom          = `${window.innerHeight - dr.top + 5}px`;
      uiContainer.style.top             = '';
      uiContainer.style.transformOrigin = 'left bottom';
    } else {
      uiContainer.style.left            = `${dr.left}px`;
      uiContainer.style.top             = `${dr.bottom + 5}px`;
      uiContainer.style.bottom          = '';
      uiContainer.style.transformOrigin = 'left top';
    }
  }

  // Geschwister-Widgets über Positionsänderung informieren.
  if (!_isRespondingToSiblingMove && !isDragging && !_justDocked) {
    const currentTarget = game.settings.get(MODULE_ID, 'dockTarget');
    window.dispatchEvent(new CustomEvent('argas:widgetMoved', {
      detail: { source: MODULE_ID, dockTarget: currentTarget }
    }));
  }
}

/** Dockt das Panel an ein Ziel an. */
function dockTo(target) {
  if (!uiContainer) return;
  uiContainer.classList.add('argas-panel-docked');
  if (target === 'players') {
    ensureSpacerInFlow();
    syncPanelToSpacer();
  } else {
    syncDockPosition();
  }
}

/** Löst das Panel vom Dock und setzt es auf freie Positionierung. */
function undock() {
  if (!uiContainer) return;
  // Aktuelle visuelle Position als CSS-Werte übernehmen.
  const rect = uiContainer.getBoundingClientRect();
  uiContainer.classList.remove('argas-panel-docked');
  uiContainer.style.left            = `${rect.left}px`;
  uiContainer.style.top             = `${rect.top}px`;
  uiContainer.style.bottom          = '';
  uiContainer.style.transformOrigin = 'left top';
}

/**
 * Prüft, ob sich der Mauszeiger in einer Dock-Zone befindet.
 * Gibt den Ziel-Namen zurück ('players', 'navigation') oder null.
 */
function detectDockZone(clientX, clientY) {
  // Day-Night-Slider Widget zuerst prüfen (höhere Priorität als Players/Navigation,
  // da der Players-Fangbereich sehr groß ist und die DNS-Zone sonst überschreibt).
  const dns = window.ArgasMods?.dayNightSlider;
  if (dns?.isConnected) {
    // Nicht andocken wenn DNS seinerseits am Benny Panel hängt.
    let dnsDockedToBenny = false;
    try {
      const pt = game.settings.get('argas-day-night-slider', 'pinTarget') ?? '';
      dnsDockedToBenny = pt.startsWith('widget-benny');
    } catch (_) {}

    if (!dnsDockedToBenny) {
      const dr = dns.getBoundingClientRect();
      const nearX = clientX >= dr.left - DOCK_ZONE && clientX <= dr.right + DOCK_ZONE;
      const nearY = clientY >= dr.top  - DOCK_ZONE && clientY <= dr.bottom + DOCK_ZONE;
      if (nearX && nearY) {
        return clientY < (dr.top + dr.bottom) / 2 ? 'widget-dns-above' : 'widget-dns-below';
      }
    }
  }

  // Players (unten links): Zone offen nach links und unten,
  // begrenzt nach rechts und oben.
  const playersActive = document.getElementById('players-active')
                     || document.getElementById('players');
  if (playersActive) {
    const pr = playersActive.getBoundingClientRect();
    if (clientX <= pr.right + DOCK_ZONE &&
        clientY >= pr.top - DOCK_ZONE) {
      return 'players';
    }
  }

  // Navigation (oben links): Zone offen nach links und oben,
  // begrenzt nach rechts und unten.
  const navActive = document.getElementById('scene-navigation-active');
  if (navActive) {
    const nr = navActive.getBoundingClientRect();
    if (clientX <= nr.right + DOCK_ZONE &&
        clientY <= nr.bottom + DOCK_ZONE) {
      return 'navigation';
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Panel erstellen                                                   */
/* ------------------------------------------------------------------ */

function initPanel() {
  const reset      = game.settings.get(MODULE_ID, 'resetPanelPosition');
  const savedPos   = game.settings.get(MODULE_ID, 'panelPosition') || {};
  const dockTarget = game.settings.get(MODULE_ID, 'dockTarget');

  uiContainer = document.createElement('div');
  uiContainer.id = UI_ID;
  uiContainer.classList.add('faded-ui');
  uiContainer.style.position    = 'fixed';
  uiContainer.style.touchAction = 'none';
  uiContainer.style.minWidth    = 'max-content';

  document.body.appendChild(uiContainer);

  // In gemeinsamer Registry registrieren, damit andere Arga-Module das Widget finden.
  (window.ArgasMods ??= {}).bennyPanel = uiContainer;

  // --- Reihen erstellen ---

  const bennyRow = createRow('benny',
    async () => {
      const actors = getActors();
      if (!actors.length) return;
      for (const a of actors) {
        if (!supportsBennies(a)) continue;
        const b = foundry.utils.getProperty(a.system, 'bennies.value') ?? 0;
        if (b <= 0) {
          ChatMessage.create({ content: game.i18n.format('ARGAS_BENNY_WOUND.CHAT.NO_BENNIES_LEFT', { actorName: chatName(a) }) });
          continue;
        }
        if (b === 1) {
          a.update({ 'system.bennies.value': 0 });
          const simple = game.settings.get(MODULE_ID, 'simpleChatMessages');
          const key = simple ? 'ARGAS_BENNY_WOUND.CHAT.BENNY_SPENT' : 'ARGAS_BENNY_WOUND.CHAT.LAST_BENNY';
          ChatMessage.create({ content: game.i18n.format(key, { actorName: chatName(a) }) });
        } else {
          a.update({ 'system.bennies.value': b - 1 });
          ChatMessage.create({ content: game.i18n.format('ARGAS_BENNY_WOUND.CHAT.BENNY_SPENT', { actorName: chatName(a) }) });
        }
        await throwBennyDie();
      }
    },
    async () => {
      const actors = getActors();
      if (!actors.length) return;
      for (const a of actors) {
        if (!supportsBennies(a)) continue;
        const b = foundry.utils.getProperty(a.system, 'bennies.value') ?? 0;
        a.update({ 'system.bennies.value': b + 1 });
        ChatMessage.create({ content: game.i18n.format('ARGAS_BENNY_WOUND.CHAT.BENNY_GAINED', { actorName: chatName(a) }) });
        await throwBennyDie();
      }
    }
  );

  const woundRow = createRow('wound',
    () => {
      const actors = getActors();
      if (!actors.length) return;
      for (const a of actors) {
        if (!supportsWounds(a)) continue;
        const w = foundry.utils.getProperty(a.system, 'wounds.value') ?? 0;
        if (w <= 0) {
          if (game.settings.get(MODULE_ID, 'showWoundMessages')) {
            const simple = game.settings.get(MODULE_ID, 'simpleChatMessages');
            const key = wKey(simple ? 'ARGAS_BENNY_WOUND.CHAT.ALREADY_HEALED' : 'ARGAS_BENNY_WOUND.CHAT.NO_WOUNDS_LEFT', a);
            ChatMessage.create({ content: game.i18n.format(key, { actorName: chatName(a) }) });
          }
          continue;
        }
        const newW = w - 1;
        a.update({ 'system.wounds.value': newW });
        if (game.settings.get(MODULE_ID, 'showWoundMessages')) {
          const simple = game.settings.get(MODULE_ID, 'simpleChatMessages');
          let key;
          if (simple) {
            key = newW === 0 ? 'ARGAS_BENNY_WOUND.CHAT.FULLY_HEALED' : 'ARGAS_BENNY_WOUND.CHAT.WOUND_LOST';
          } else if (newW === 0) key = 'ARGAS_BENNY_WOUND.CHAT.FULLY_HEALED';
          else if (newW === 1) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_HEAL_TO_1';
          else if (newW === 2) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_HEAL_TO_2';
          else if (newW === 3) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_HEAL_TO_3';
          else if (newW === 4) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_HEAL_TO_4';
          else if (newW === 5) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_HEAL_TO_5';
          else if (newW === 6) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_HEAL_TO_6';
          else key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_LOST';
          key = wKey(key, a);
          ChatMessage.create({ content: game.i18n.format(key, { actorName: chatName(a) }) });
        }
      }
    },
    () => {
      const actors = getActors();
      if (!actors.length) return;
      for (const a of actors) {
        if (!supportsWounds(a)) continue;
        const w   = foundry.utils.getProperty(a.system, 'wounds.value') ?? 0;
        const max = foundry.utils.getProperty(a.system, 'wounds.max') ?? 3;
        if (w >= max) {
          if (game.settings.get(MODULE_ID, 'showWoundMessages')) {
            const simple = game.settings.get(MODULE_ID, 'simpleChatMessages');
            const key = wKey(simple ? 'ARGAS_BENNY_WOUND.CHAT.INCAPACITATED_WOUNDS_SIMPLE' : 'ARGAS_BENNY_WOUND.CHAT.INCAPACITATED_WOUNDS', a);
            ChatMessage.create({ content: game.i18n.format(key, { actorName: chatName(a) }) });
          }
          continue;
        }
        const newW = w + 1;
        a.update({ 'system.wounds.value': newW });
        if (game.settings.get(MODULE_ID, 'showWoundMessages')) {
          const simple = game.settings.get(MODULE_ID, 'simpleChatMessages');
          let key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_GAINED';
          if (!simple) {
            if (newW === 1) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_LEVEL_1';
            else if (newW === 2) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_LEVEL_2';
            else if (newW === 3) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_LEVEL_3';
            else if (newW === 4) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_LEVEL_4';
            else if (newW === 5) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_LEVEL_5';
            else if (newW === 6) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_LEVEL_6';
            else if (newW === 7) key = 'ARGAS_BENNY_WOUND.CHAT.WOUND_LEVEL_7';
          }
          key = wKey(key, a);
          ChatMessage.create({ content: game.i18n.format(key, { actorName: chatName(a) }) });
        }
      }
    }
  );

  const fatigueRow = createRow('fatigue',
    () => {
      const actors = getActors();
      if (!actors.length) return;
      for (const a of actors) {
        if (!supportsFatigue(a)) continue;
        const f = foundry.utils.getProperty(a.system, 'fatigue.value') ?? 0;
        if (f <= 0) {
          if (game.settings.get(MODULE_ID, 'showFatigueMessages')) {
            const simple = game.settings.get(MODULE_ID, 'simpleChatMessages');
            const key = simple ? 'ARGAS_BENNY_WOUND.CHAT.ALREADY_RECOVERED' : 'ARGAS_BENNY_WOUND.CHAT.NO_FATIGUE_LEFT';
            ChatMessage.create({ content: game.i18n.format(key, { actorName: chatName(a) }) });
          }
          continue;
        }
        a.update({ 'system.fatigue.value': f - 1 });
        if (game.settings.get(MODULE_ID, 'showFatigueMessages')) {
          const simple = game.settings.get(MODULE_ID, 'simpleChatMessages');
          let key;
          if (simple) {
            key = 'ARGAS_BENNY_WOUND.CHAT.FATIGUE_LOST';
          } else if (f === 1) key = 'ARGAS_BENNY_WOUND.CHAT.ALL_FATIGUE_GONE';
          else if (f === 2) key = 'ARGAS_BENNY_WOUND.CHAT.FATIGUE_DOWN_TO_1';
          else key = 'ARGAS_BENNY_WOUND.CHAT.FATIGUE_LOST';
          ChatMessage.create({ content: game.i18n.format(key, { actorName: chatName(a) }) });
        }
      }
    },
    () => {
      const actors = getActors();
      if (!actors.length) return;
      for (const a of actors) {
        if (!supportsFatigue(a)) continue;
        const f   = foundry.utils.getProperty(a.system, 'fatigue.value') ?? 0;
        const max = foundry.utils.getProperty(a.system, 'fatigue.max') ?? 2;
        if (f >= max) {
          if (game.settings.get(MODULE_ID, 'showFatigueMessages')) {
            const simple = game.settings.get(MODULE_ID, 'simpleChatMessages');
            const key = simple ? 'ARGAS_BENNY_WOUND.CHAT.INCAPACITATED_FATIGUE_SIMPLE' : 'ARGAS_BENNY_WOUND.CHAT.INCAPACITATED_FATIGUE';
            ChatMessage.create({ content: game.i18n.format(key, { actorName: chatName(a) }) });
          }
          continue;
        }
        const newF = f + 1;
        a.update({ 'system.fatigue.value': newF });
        if (game.settings.get(MODULE_ID, 'showFatigueMessages')) {
          const simple = game.settings.get(MODULE_ID, 'simpleChatMessages');
          let key = 'ARGAS_BENNY_WOUND.CHAT.FATIGUE_GAINED';
          if (!simple) {
            if (newF === 1) key = 'ARGAS_BENNY_WOUND.CHAT.FATIGUE_LEVEL_1';
            else if (newF === 2) key = 'ARGAS_BENNY_WOUND.CHAT.FATIGUE_LEVEL_2';
          }
          ChatMessage.create({ content: game.i18n.format(key, { actorName: chatName(a) }) });
        }
      }
    }
  );

  uiContainer.append(bennyRow, woundRow, fatigueRow);

  // --- Doppelklick auf die mittleren Icons kollabiert das Panel ---
  // Die drei .argas-panel-icon Elemente (benny/wound/fatigue) dienen als
  // Collapse-Trigger. pointerEvents werden dafür aktiviert (war 'none').
  uiContainer.querySelectorAll('.argas-panel-icon').forEach(img => {
    img.style.pointerEvents = '';          // pointerEvents: none aus createRow aufheben.
    img.title = game.i18n.localize('ARGAS_BENNY_WOUND.UI.TOOLTIP_COLLAPSE');
    img.addEventListener('dblclick', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      collapsePanel();
    });
  });

  // --- Spacer für Players-Docking erstellen ---
  spacerElement = document.createElement('div');
  spacerElement.dataset.argasPanelSpacer = 'true';
  spacerElement.style.height = '0';
  spacerElement.style.overflow = 'hidden';
  spacerElement.style.pointerEvents = 'none';
  ensureSpacerInFlow();

  // --- UI-Scale ---
  applyUiScale();

  // --- Initiale Positionierung ---
  if (reset) {
    // Reset: An Scene Navigation docken.
    game.settings.set(MODULE_ID, 'dockTarget', 'navigation');
    game.settings.set(MODULE_ID, 'panelPosition', { top: null, left: null });
    dockTo('navigation');
  } else if (dockTarget !== 'none') {
    dockTo(dockTarget);
  } else if (savedPos.top && savedPos.left) {
    uiContainer.style.top  = savedPos.top;
    uiContainer.style.left = savedPos.left;
    const c = clampToViewport(parseFloat(savedPos.left) || 0, parseFloat(savedPos.top) || 0);
    uiContainer.style.left = `${c.x}px`;
    uiContainer.style.top  = `${c.y}px`;
  } else {
    // Erstinstallation: An Scene Navigation docken.
    game.settings.set(MODULE_ID, 'dockTarget', 'navigation');
    game.settings.set(MODULE_ID, 'panelPosition', { top: null, left: null });
    dockTo('navigation');
  }

  // --- Kontextmenü unterdrücken ---
  uiContainer.addEventListener('contextmenu', e => e.preventDefault());

  // --- Drag & Drop mit Dock-Erkennung ---
  let offX = 0, offY = 0;
  let wasDocked = false;
  let currentDockZone = null;

  uiContainer.addEventListener('pointerdown', e => {
    if (e.button !== 2) return;
    isDragging = true;
    uiContainer.style.transition = '';  // Resize-Transition sofort aufheben.
    _snappedToSidebar = false;          // Sidebar-Flags zurücksetzen.
    _pushedBySidebar = false;
    wasDocked = game.settings.get(MODULE_ID, 'dockTarget') !== 'none';
    currentDockZone = null;

    const rect = uiContainer.getBoundingClientRect();
    offX = e.clientX - rect.left;
    offY = e.clientY - rect.top;

    // Falls gedockt: sofort lösen für freies Ziehen.
    if (wasDocked) undock();

    uiContainer.setPointerCapture(e.pointerId);
  });

  uiContainer.addEventListener('pointermove', e => {
    if (!isDragging) return;

    const rawX = e.clientX - offX;
    const rawY = e.clientY - offY;

    // Dock-Zone prüfen
    const zone = detectDockZone(e.clientX, e.clientY);
    currentDockZone = zone;

    if (zone) {
      // In Dock-Zone: Vorschau der angedockten Position zeigen.
      if (zone === 'players') {
        ensureSpacerInFlow();
        syncPanelToSpacer();
      } else if (zone === 'navigation') {
        const anchor = getDockAnchor(zone);
        if (anchor) {
          const ar     = anchor.getBoundingClientRect();
          const scale  = getUiScale();
          const gap    = DOCK_GAP * scale;
          uiContainer.style.left            = `${ar.left}px`;
          uiContainer.style.top             = `${ar.bottom + gap}px`;
          uiContainer.style.bottom          = '';
          uiContainer.style.transformOrigin = 'left top';
        }
      } else if (zone === 'widget-dns-above' || zone === 'widget-dns-below') {
        const dns = window.ArgasMods?.dayNightSlider;
        if (dns?.isConnected) {
          const dr = dns.getBoundingClientRect();
          if (zone === 'widget-dns-above') {
            uiContainer.style.left            = `${dr.left}px`;
            uiContainer.style.bottom          = `${window.innerHeight - dr.top + 5}px`;
            uiContainer.style.top             = '';
            uiContainer.style.transformOrigin = 'left bottom';
          } else {
            uiContainer.style.left            = `${dr.left}px`;
            uiContainer.style.top             = `${dr.bottom + 5}px`;
            uiContainer.style.bottom          = '';
            uiContainer.style.transformOrigin = 'left top';
          }
        }
      }
      uiContainer.classList.add('argas-panel-dock-preview');
    } else {
      // Außerhalb Dock-Zone: normale Snap + Clamp Logik.
      uiContainer.classList.remove('argas-panel-dock-preview');
      uiContainer.style.transformOrigin = 'left top';
      const rect   = uiContainer.getBoundingClientRect();
      const panelW = rect.width;
      const panelH = rect.height;
      const snapped = snapPosition(rawX, rawY, panelW, panelH);
      const pos     = clampToViewport(snapped.x, snapped.y);
      uiContainer.style.left   = `${pos.x}px`;
      uiContainer.style.top    = `${pos.y}px`;
      uiContainer.style.bottom = '';
    }
  });

  uiContainer.addEventListener('pointerup', async e => {
    if (!isDragging) return;
    uiContainer.releasePointerCapture(e.pointerId);
    uiContainer.classList.remove('argas-panel-dock-preview');

    if (currentDockZone) {
      // Setting ZUERST speichern (isDragging ist noch true → Observer blockiert).
      await game.settings.set(MODULE_ID, 'dockTarget', currentDockZone);
      await game.settings.set(MODULE_ID, 'panelPosition', { top: null, left: null });
      // JETZT isDragging aufheben und docken.
      isDragging = false;
      _justDocked = true;
      dockTo(currentDockZone);
      _justDocked = false;
    } else {
      // Frei positioniert – Setting speichern, dann isDragging aufheben.
      await game.settings.set(MODULE_ID, 'dockTarget', 'none');
      isDragging = false;
      await game.settings.set(MODULE_ID, 'panelPosition', {
        top:  uiContainer.style.top,
        left: uiContainer.style.left
      });

      // Prüfen ob das Widget an der offenen Sidebar gesnappt ist.
      // Flag jetzt setzen, damit der ResizeObserver beim Zuklappen sofort folgt
      // (statt auf den ersten Frame zu warten, wo die Sidebar schon bewegt ist).
      const sb = document.getElementById('sidebar');
      if (sb) {
        const wr = uiContainer.getBoundingClientRect();
        const sr = sb.getBoundingClientRect();
        if (sr.width > 100 && Math.abs(wr.right - sr.left) < SNAP_THRESHOLD + EDGE_MARGIN) {
          _snappedToSidebar = true;
        }
      }
    }
    currentDockZone = null;
  });

  // --- UI-Scale: MutationObserver ---
  const uiScaleEl = document.getElementById('ui-top')?.closest('[style*="--ui-scale"]');
  if (uiScaleEl) {
    const mo = new MutationObserver(() => {
      applyUiScale();
      const target = game.settings.get(MODULE_ID, 'dockTarget');
      if (target !== 'none') {
        syncDockPosition();
      } else {
        const curX = parseFloat(uiContainer.style.left) || 0;
        const curY = parseFloat(uiContainer.style.top) || 0;
        const rc = clampToViewport(curX, curY);
        uiContainer.style.left = `${rc.x}px`;
        uiContainer.style.top  = `${rc.y}px`;
      }
    });
    mo.observe(uiScaleEl, { attributes: true, attributeFilter: ['style'] });
  }

  // --- Fenster-Resize ---
  // Hilfsfunktion: Widget an gespeicherter Position clampen + Sidebar-Check.
  function handleFreeResize() {
    if (!uiContainer?.isConnected) return;
    if (isCollapsed) return; // Im kollabierten Zustand keine Neupositionierung.
    if (game.settings.get(MODULE_ID, 'dockTarget') !== 'none') return;

    const scale  = getUiScale();
    const panelW = uiContainer.offsetWidth * scale;
    const panelH = uiContainer.offsetHeight * scale;
    const rect   = uiContainer.getBoundingClientRect();
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;

    const saved = game.settings.get(MODULE_ID, 'panelPosition') || {};
    const baseX = (saved.left ? parseFloat(saved.left) : null) ?? rect.left;
    const baseY = (saved.top  ? parseFloat(saved.top)  : null) ?? rect.top;

    let clampedX   = Math.max(EDGE_MARGIN, Math.min(baseX, vw - panelW - EDGE_MARGIN));
    const clampedY = Math.max(EDGE_MARGIN, Math.min(baseY, vh - panelH - EDGE_MARGIN));

    const sidebarEl = document.getElementById('sidebar');
    if (sidebarEl) {
      const sr = sidebarEl.getBoundingClientRect();
      if (clampedX + panelW > sr.left - EDGE_MARGIN) {
        clampedX = sr.left - panelW - EDGE_MARGIN;
      }
    }

    if (Math.abs(clampedX - rect.left) > 0.5 || Math.abs(clampedY - rect.top) > 0.5) {
      uiContainer.style.left   = `${clampedX}px`;
      uiContainer.style.top    = `${clampedY}px`;
      uiContainer.style.bottom = '';
    }
  }

  window.addEventListener('resize', () => {
    if (!uiContainer?.isConnected) return;
    const target = game.settings.get(MODULE_ID, 'dockTarget');
    if (target !== 'none') {
      syncDockPosition();
      return;
    }
    // Sofort clampen (Viewport-Grenzen stimmen bereits), dann nach
    // 300ms nochmal prüfen (Sidebar-Position ist jetzt final).
    // CSS-Transition macht die Korrektur weich statt ein harter Sprung.
    handleFreeResize();
    uiContainer.style.transition = 'left 0.25s ease, top 0.25s ease';
    setTimeout(() => {
      handleFreeResize();
      setTimeout(() => { uiContainer.style.transition = ''; }, 300);
    }, 300);
  });

  // --- Sidebar-Verschiebung (nur im freien Modus) ---
  // ResizeObserver feuert auf jedem Frame der CSS-Transition, damit
  // das Panel synchron mit der Sidebar mitfährt statt zu springen.
  // Zwei Verhaltensweisen:
  //   _snappedToSidebar: Widget wurde absichtlich an Sidebar platziert → mitbewegen, neue Position speichern.
  //   _pushedBySidebar:  Widget stand im Weg → wegdrücken, beim Zuklappen Originalposition wiederherstellen.
  const sidebar = document.getElementById('sidebar');
  if (sidebar) {
    const sidebarRo = new ResizeObserver(() => {
      if (!uiContainer?.isConnected) return;
      if (isDragging) return;

      // Im kollabierten Zustand: Icon mitbewegen (nur im freien Icon-Modus;
      // im angedockten Modus übernimmt syncDockPosition via syncIconPosition).
      if (isCollapsed) {
        if (game.settings.get(MODULE_ID, 'iconDockTarget') !== 'none') return;
        const ir = iconElement.getBoundingClientRect();
        const sr = sidebar.getBoundingClientRect();
        if (ir.right > sr.left - EDGE_MARGIN && sr.width > 100) {
          if (_iconPreSidebarX === null) _iconPreSidebarX = ir.left;
          iconElement.style.left = `${sr.left - ir.width - EDGE_MARGIN}px`;
        } else if (_iconPreSidebarX !== null && sr.width <= 100) {
          iconElement.style.left = `${_iconPreSidebarX}px`;
          _iconPreSidebarX = null;
        }
        return;
      }

      if (game.settings.get(MODULE_ID, 'dockTarget') !== 'none') return;

      const wr = uiContainer.getBoundingClientRect();
      const sr = sidebar.getBoundingClientRect();

      // --- Schritt 1: Einmalige Erkennung ob Widget an Sidebar klebt ---
      // Nur setzen wenn noch nicht gesetzt und Widget nicht weggedrückt wurde.
      // sr.width > 100 stellt sicher, dass die Sidebar offen ist (offen ~348px, zu ~48px).
      if (!_snappedToSidebar && !_pushedBySidebar &&
          Math.abs(wr.right - sr.left) < SNAP_THRESHOLD && sr.width > 100) {
        _snappedToSidebar = true;
      }

      // --- Schritt 2: Snap-Follow (höchste Priorität, mit return!) ---
      if (_snappedToSidebar) {
        // Bedingungslos folgen, egal was sr.width oder wr.right sagt.
        uiContainer.style.left = `${sr.left - wr.width - EDGE_MARGIN}px`;

        // Sidebar vollständig zugeklappt (Endwert ist ~48px, <= 60 als Schwelle).
        if (sr.width <= 60) {
          _snappedToSidebar = false;
          // Neue Position speichern (Widget bleibt an der zugeklappten Sidebar).
          const newRect = uiContainer.getBoundingClientRect();
          game.settings.set(MODULE_ID, 'panelPosition', {
            top:  `${Math.round(newRect.top)}px`,
            left: `${Math.round(newRect.left)}px`
          });
        }
        return;  // WICHTIG: Kein anderer Zweig darf eingreifen!
      }

      // --- Schritt 3: Push-Logik (Widget wurde weggedrückt) ---
      if (wr.right > sr.left - EDGE_MARGIN && sr.width > 100) {
        _pushedBySidebar = true;
        uiContainer.style.left = `${sr.left - wr.width - EDGE_MARGIN}px`;
      } else if (_pushedBySidebar && sr.width <= 100) {
        _pushedBySidebar = false;
        const saved = game.settings.get(MODULE_ID, 'panelPosition') || {};
        if (saved.left) {
          uiContainer.style.left = saved.left;
        }
      }
    });
    sidebarRo.observe(sidebar);
  }

  // --- Dock-Ziel Re-Render Hooks ---
  const handleDockTargetChange = () => {
    if (!uiContainer?.isConnected) return;
    syncDockPosition();
  };

  Hooks.on('renderPlayers', handleDockTargetChange);
  Hooks.on('renderPlayerList', handleDockTargetChange);



  // --- ResizeObserver für Dock-Ziel-Änderungen ---
  for (const id of ['players', 'players-active', 'players-inactive']) {
    const el = document.getElementById(id);
    if (el) {
      if (id === 'players-active' || id === 'players-inactive') el.dataset.argasObserved = 'true';
      const ro = new ResizeObserver(() => {
        const target     = game.settings.get(MODULE_ID, 'dockTarget');
        const iconTarget = isCollapsed ? game.settings.get(MODULE_ID, 'iconDockTarget') : 'none';
        const relevant   = target === 'players' || iconTarget === 'players';
        if (relevant && (id === 'players' || id === 'players-active' || id === 'players-inactive')) {
          ensureSpacerInFlow();
          syncDockPosition();
        } else if (target === id || iconTarget === id) {
          syncDockPosition();
        }
      });
      ro.observe(el);
    }
  }

  // MutationObserver auf #players: fängt ab, wenn Foundry die Kinderliste
  // neu aufbaut (z.B. Spieler kommt/geht), oder wenn Kinder ein-/ausgeklappt
  // werden (Expand-Button für inaktive Spieler).
  const playersEl = document.getElementById('players');
  if (playersEl) {
    const pmo = new MutationObserver(() => {
      const target     = game.settings.get(MODULE_ID, 'dockTarget');
      const iconTarget = isCollapsed ? game.settings.get(MODULE_ID, 'iconDockTarget') : 'none';
      if (target !== 'players' && iconTarget !== 'players') return;
      requestAnimationFrame(() => {
        ensureSpacerInFlow();
        syncDockPosition();
      });

      // Falls #players-active neu erstellt wurde: ResizeObserver nachreichen.
      const freshActive = document.getElementById('players-active');
      if (freshActive && !freshActive.dataset.argasObserved) {
        freshActive.dataset.argasObserved = 'true';
        const ro = new ResizeObserver(() => {
          const t  = game.settings.get(MODULE_ID, 'dockTarget');
          const it = isCollapsed ? game.settings.get(MODULE_ID, 'iconDockTarget') : 'none';
          if (t === 'players' || it === 'players') {
            ensureSpacerInFlow();
            syncDockPosition();
          }
        });
        ro.observe(freshActive);
      }
    });
    pmo.observe(playersEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  }

  // Zusätzlich: Click-Listener auf den Expand-Button (#players-expand),
  // der inaktive Spieler ein-/ausklappt. Die DOM-Änderung wird ggf. animiert
  // und der MutationObserver reagiert zu früh, daher kurze Verzögerung.
  const expandBtn = document.getElementById('players-expand');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      if (game.settings.get(MODULE_ID, 'dockTarget') !== 'players') return;
      // Mehrfach synchronisieren, um Animationen abzufangen.
      setTimeout(() => { ensureSpacerInFlow(); syncDockPosition(); }, 100);
      setTimeout(() => { ensureSpacerInFlow(); syncDockPosition(); }, 300);
      setTimeout(() => { ensureSpacerInFlow(); syncDockPosition(); }, 500);
    });
  }

  // --- Scene Navigation: Expand/Collapse ---
  // MutationObserver auf #scene-navigation: Klassenänderung 'expanded'
  // erkennt Auf-/Zuklappen. ResizeObserver feuert hier NICHT, weil sich
  // nur visibility ändert, nicht die Elementgröße.
  const sceneNavEl = document.getElementById('scene-navigation');
  if (sceneNavEl) {
    const navMo = new MutationObserver(() => {
      const t  = game.settings.get(MODULE_ID, 'dockTarget');
      const it = isCollapsed ? game.settings.get(MODULE_ID, 'iconDockTarget') : 'none';
      if (t !== 'navigation' && it !== 'navigation') return;
      requestAnimationFrame(() => syncDockPosition());
    });
    navMo.observe(sceneNavEl, { attributes: true, attributeFilter: ['class'] });

    // Click-Listener auf den Expand-Button (#scene-navigation-expand).
    const navExpandBtn = document.getElementById('scene-navigation-expand');
    if (navExpandBtn) {
      navExpandBtn.addEventListener('click', () => {
        const t  = game.settings.get(MODULE_ID, 'dockTarget');
        const it = isCollapsed ? game.settings.get(MODULE_ID, 'iconDockTarget') : 'none';
        if (t !== 'navigation' && it !== 'navigation') return;
        setTimeout(() => syncDockPosition(), 100);
        setTimeout(() => syncDockPosition(), 300);
        setTimeout(() => syncDockPosition(), 500);
      });
    }
  }

  // renderSceneNavigation Hook: Szenen hinzugefügt/entfernt → DOM neu aufgebaut.
  Hooks.on('renderSceneNavigation', () => {
    if (!uiContainer?.isConnected) return;
    const t  = game.settings.get(MODULE_ID, 'dockTarget');
    const it = isCollapsed ? game.settings.get(MODULE_ID, 'iconDockTarget') : 'none';
    if (t !== 'navigation' && it !== 'navigation') return;
    setTimeout(() => syncDockPosition(), 100);
    setTimeout(() => syncDockPosition(), 300);
  });

  // Geschwister-Widget-Sync: Wenn ein anderes Arga-Modul sein Widget bewegt,
  // prüfen ob wir an jenem Widget angedockt sind und ggf. nachziehen.
  window.addEventListener('argas:widgetMoved', (ev) => {
    if (ev.detail?.source === MODULE_ID) return;
    if (!uiContainer?.isConnected) return;
    const target     = game.settings.get(MODULE_ID, 'dockTarget');
    const iconTarget = isCollapsed ? game.settings.get(MODULE_ID, 'iconDockTarget') : 'none';
    if (target === 'widget-dns-above' || target === 'widget-dns-below') {
      _isRespondingToSiblingMove = true;
      syncDockPosition();
      _isRespondingToSiblingMove = false;
    } else if (iconTarget === 'widget-dns-above' || iconTarget === 'widget-dns-below') {
      _isRespondingToSiblingMove = true;
      syncDockPosition(); // isCollapsed-Branch handled via iconTarget
      _isRespondingToSiblingMove = false;
    }
  });

  // ----------------------------------------------------------------
  //  Collapse-Icon erstellen und einrichten
  // ----------------------------------------------------------------

  // iconElement = Wrapper-Div (Positionierung, faded-ui, display).
  // Das <img> darin ist nur der visuelle Inhalt.
  const iconWrapper = document.createElement('div');
  iconWrapper.id = 'argas-panel-collapse-icon';
  iconWrapper.classList.add('faded-ui');
  iconElement = iconWrapper;

  iconImg = document.createElement('img');
  iconImg.title     = game.i18n.localize('ARGAS_BENNY_WOUND.UI.TOOLTIP_EXPAND');
  iconImg.draggable = false;
  iconImg.style.display = 'block';
  applyIconVertical(); // setzt src, width, height je nach Setting
  iconWrapper.appendChild(iconImg);
  document.body.appendChild(iconWrapper);

  // Doppelklick (linke Maustaste) → Panel wiederherstellen.
  iconElement.addEventListener('dblclick', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    expandPanel();
  });

  // Icon-Drag (rechte Maustaste) mit Snap- und Dock-Logik.
  {
    let _iconOffX = 0, _iconOffY = 0, _iconDragging = false, _iconCurrentZone = null;

    iconElement.addEventListener('pointerdown', (e) => {
      if (e.button !== 2) return;
      _iconDragging = true;
      _iconCurrentZone = null;
      const r = iconElement.getBoundingClientRect();
      _iconOffX = e.clientX - r.left;
      _iconOffY = e.clientY - r.top;
      iconElement.setPointerCapture(e.pointerId);
      iconElement.style.cursor = 'grabbing';
      e.preventDefault();
    });

    iconElement.addEventListener('pointermove', (e) => {
      if (!_iconDragging) return;
      const zone = detectDockZone(e.clientX, e.clientY);
      _iconCurrentZone = zone;

      if (zone) {
        // Dock-Vorschau: Icon an die Zielposition snappen + Jiggle.
        syncIconPosition(zone);
        iconElement.classList.add('argas-panel-dock-preview');
      } else {
        iconElement.classList.remove('argas-panel-dock-preview');
        const iw  = iconElement.offsetWidth  || 72;
        const ih  = iconElement.offsetHeight || 32;
        const rawX = e.clientX - _iconOffX;
        const rawY = e.clientY - _iconOffY;
        const snapped = snapPosition(rawX, rawY, iw, ih);
        const x = Math.max(0, Math.min(snapped.x, window.innerWidth  - iw));
        const y = Math.max(0, Math.min(snapped.y, window.innerHeight - ih));
        iconElement.style.left = `${x}px`;
        iconElement.style.top  = `${y}px`;
      }
    });

    iconElement.addEventListener('pointerup', async (e) => {
      if (!_iconDragging) return;
      _iconDragging = false;
      iconElement.releasePointerCapture(e.pointerId);
      iconElement.style.cursor = '';
      iconElement.classList.remove('argas-panel-dock-preview');

      const zone = _iconCurrentZone || detectDockZone(e.clientX, e.clientY);
      _iconCurrentZone = null;

      try {
        if (zone) {
          // Icon an Dock-Ziel andocken: iconDockTarget setzen (Panel bleibt unberührt).
          await game.settings.set(MODULE_ID, 'iconDockTarget', zone);
          syncIconPosition(zone);
        } else {
          // Frei positioniert: iconDockTarget löschen, Icon-Position speichern.
          await game.settings.set(MODULE_ID, 'iconDockTarget', 'none');
          const r = iconElement.getBoundingClientRect();
          await game.settings.set(MODULE_ID, 'iconPosition', {
            top:  Math.round(r.top),
            left: Math.round(r.left)
          });
        }
      } catch (_) {}
    });

    iconElement.addEventListener('lostpointercapture', () => {
      _iconDragging = false;
      iconElement.style.cursor = '';
      iconElement.classList.remove('argas-panel-dock-preview');
      _iconCurrentZone = null;
    });

    // Kontextmenü auf dem Icon unterdrücken.
    iconElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // ----------------------------------------------------------------
  //  Initialer Zustand: War das Panel beim letzten Reload kollabiert?
  // ----------------------------------------------------------------
  {
    let wasCollapsed = false;
    try { wasCollapsed = game.settings.get(MODULE_ID, 'collapsed') ?? false; } catch (_) {}
    if (wasCollapsed && !reset) {
      // false → State nicht nochmal speichern (ist bereits korrekt gespeichert).
      collapsePanel(false);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Hilfsfunktionen                                                   */
/* ------------------------------------------------------------------ */

/** Gibt alle Actors der aktuell kontrollierten Token zurück.
 *  Zeigt eine Warnung und gibt [] zurück, wenn kein Token ausgewählt ist. */
function getActors() {
  const actors = canvas.tokens.controlled
    .map(t => t.actor)
    .filter(Boolean);
  if (actors.length === 0) {
    ui.notifications.warn(game.i18n.localize('ARGAS_BENNY_WOUND.CHAT.NO_TOKEN_SELECTED'));
    return [];
  }
  return actors;
}

/** Gibt den Actor-Namen als fetten Großbuchstaben-String für Chat-Nachrichten zurück. */
function chatName(actor) {
  return `<strong>${actor.name.toUpperCase()}</strong>`;
}

/**
 * Gibt den i18n-Key zurück – für Fahrzeuge wird der _VEHICLE-Suffix verwendet,
 * da Fahrzeuge nicht geheilt, sondern repariert werden und eigene Statusmeldungen haben.
 */
function wKey(key, actor) {
  return actor?.type === 'vehicle' ? `${key}_VEHICLE` : key;
}

/**
 * Löst die DICE SO NICE Animation für einen Benny-Würfel aus.
 * Nutzt den nativen SWADE-Benny-Würfeltyp aus CONFIG.SWADE, Fallback: 1d6.
 * Tut nichts, wenn DICE SO NICE nicht aktiv ist.
 */
async function throwBennyDie() {
  if (!game.dice3d) return;
  const formula = CONFIG.SWADE?.bennies?.denomination
    ? `1${CONFIG.SWADE.bennies.denomination}`
    : '1db';
  const roll = await new Roll(formula).evaluate();
  await game.dice3d.showForRoll(roll, game.user, true);
}

/** Prüft ob der Actor Bennys unterstützt (keine Fahrzeuge, keine Gruppen). */
function supportsBennies(actor) {
  const t = actor.type;
  if (t === 'vehicle' || t === 'group') {
    ui.notifications.warn(game.i18n.format('ARGAS_BENNY_WOUND.CHAT.NO_BENNY_SUPPORT', { actorName: `<strong>${actor.name}</strong>` }));
    return false;
  }
  return true;
}

/** Prüft ob der Actor Erschöpfung unterstützt (keine Fahrzeuge, keine Gruppen). */
function supportsFatigue(actor) {
  const t = actor.type;
  if (t === 'vehicle' || t === 'group') {
    ui.notifications.warn(game.i18n.format('ARGAS_BENNY_WOUND.CHAT.NO_FATIGUE_SUPPORT', { actorName: `<strong>${actor.name}</strong>` }));
    return false;
  }
  return true;
}

/** Prüft ob der Actor Wunden unterstützt (keine Gruppen; Fahrzeuge haben Wunden). */
function supportsWounds(actor) {
  if (actor.type === 'group') {
    ui.notifications.warn(game.i18n.format('ARGAS_BENNY_WOUND.CHAT.NO_WOUND_SUPPORT', { actorName: `<strong>${actor.name}</strong>` }));
    return false;
  }
  return true;
}

function createRow(type, onMinus, onPlus) {
  const row = document.createElement('div');
  row.className = 'argas-panel-row';

  const minus = document.createElement('button');
  minus.className = 'argas-panel-button';
  minus.textContent = '−';
  minus.addEventListener('click', onMinus);

  const icon = document.createElement('img');
  icon.className = 'argas-panel-icon';
  icon.src = `modules/${MODULE_ID}/assets/${type}.webp`;
  icon.style.pointerEvents = 'none';

  const plus = document.createElement('button');
  plus.className = 'argas-panel-button';
  plus.textContent = '+';
  plus.addEventListener('click', onPlus);

  row.append(minus, icon, plus);
  return row;
}
