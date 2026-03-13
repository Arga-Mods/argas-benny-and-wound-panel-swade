// Die Texte werden per Lazy Localization direkt als i18n-Schlüssel übergeben.

const MODULE_ID = 'argas-benny-and-wound-panel-swade';

Hooks.once('init', () => {

  // 1. Ermöglicht es, das Modul auch für Spieler freizuschalten.
  game.settings.register(MODULE_ID, 'visibleToPlayers', {
    name: 'ARGAS_BENNY_WOUND.SETTINGS.VISIBLE_TO_PLAYERS_NAME',
    hint: 'ARGAS_BENNY_WOUND.SETTINGS.VISIBLE_TO_PLAYERS_HINT',
    scope: 'world',
    config: true,
    default: false,
    type: Boolean
  });

  // 2. Deaktiviert das Modul nur für den eigenen Client.
  game.settings.register(MODULE_ID, 'disabledLocally', {
    name: 'ARGAS_BENNY_WOUND.SETTINGS.DISABLED_LOCALLY_NAME',
    hint: 'ARGAS_BENNY_WOUND.SETTINGS.DISABLED_LOCALLY_HINT',
    scope: 'client',
    config: true,
    default: false,
    type: Boolean
  });

  // 3. Setzt die Position des Panels bei jedem Neustart auf die Standardposition zurück.
  game.settings.register(MODULE_ID, 'resetPanelPosition', {
    name: 'ARGAS_BENNY_WOUND.SETTINGS.RESET_PANEL_POSITION_NAME',
    hint: 'ARGAS_BENNY_WOUND.SETTINGS.RESET_PANEL_POSITION_HINT',
    scope: 'client',
    config: true,
    default: false,
    type: Boolean
  });

  // 4. Kompakt-Symbol hochkant darstellen.
  game.settings.register(MODULE_ID, 'iconVertical', {
    name: 'ARGAS_BENNY_WOUND.SETTINGS.ICON_VERTICAL_NAME',
    hint: 'ARGAS_BENNY_WOUND.SETTINGS.ICON_VERTICAL_HINT',
    scope: 'client',
    config: true,
    default: false,
    type: Boolean
  });

  // 5. Zeigt Wundenänderungen im Chat an.
  game.settings.register(MODULE_ID, 'showWoundMessages', {
    name: 'ARGAS_BENNY_WOUND.SETTINGS.WOUND_MESSAGES_NAME',
    hint: 'ARGAS_BENNY_WOUND.SETTINGS.WOUND_MESSAGES_HINT',
    scope: 'world',
    config: true,
    default: true,
    type: Boolean,
    restricted: true
  });

  // 6. Zeigt Erschöpfungsänderungen im Chat an.
  game.settings.register(MODULE_ID, 'showFatigueMessages', {
    name: 'ARGAS_BENNY_WOUND.SETTINGS.FATIGUE_MESSAGES_NAME',
    hint: 'ARGAS_BENNY_WOUND.SETTINGS.FATIGUE_MESSAGES_HINT',
    scope: 'world',
    config: true,
    default: true,
    type: Boolean,
    restricted: true
  });

  // 7. Chatausgabe: Bennys – rein informativ, systemseitig aktiviert.
  game.settings.register(MODULE_ID, 'showBennyMessages', {
    name: 'ARGAS_BENNY_WOUND.SETTINGS.BENNY_MESSAGES_NAME',
    hint: 'ARGAS_BENNY_WOUND.SETTINGS.BENNY_MESSAGES_HINT',
    scope: 'world',
    config: true,
    default: true,
    type: Boolean,
    restricted: true
  });

  // 8. Chatausgabe: Einfacher Text – kurze Nachrichten ohne Erklärungstext.
  game.settings.register(MODULE_ID, 'simpleChatMessages', {
    name: 'ARGAS_BENNY_WOUND.SETTINGS.SIMPLE_CHAT_NAME',
    hint: 'ARGAS_BENNY_WOUND.SETTINGS.SIMPLE_CHAT_HINT',
    scope: 'client',
    config: true,
    default: false,
    type: Boolean
  });

  // 9. Gespeicherte Panel-Position als { top, left }.
  game.settings.register(MODULE_ID, 'panelPosition', {
    name: 'Panel-Position',
    scope: 'client',
    config: false,
    type: Object,
    default: { top: null, left: null }
  });

  // 10. Dock-Ziel: 'none', 'players' oder 'navigation'.
  game.settings.register(MODULE_ID, 'dockTarget', {
    name: 'Dock Target',
    scope: 'client',
    config: false,
    type: String,
    default: 'none'
  });

  // 11. Kollabiert-Zustand: Panel ist auf Icon reduziert.
  game.settings.register(MODULE_ID, 'collapsed', {
    name: 'Panel kollabiert',
    scope: 'client',
    config: false,
    type: Boolean,
    default: false
  });

  // 12. Position des Collapse-Icons { top, left } in px.
  game.settings.register(MODULE_ID, 'iconPosition', {
    name: 'Icon-Position',
    scope: 'client',
    config: false,
    type: Object,
    default: { top: null, left: null }
  });

  // 13. Dock-Ziel des Collapse-Icons (unabhängig vom Panel-Docking).
  game.settings.register(MODULE_ID, 'iconDockTarget', {
    name: 'Icon Dock Target',
    scope: 'client',
    config: false,
    type: String,
    default: 'navigation'
  });
});

let oldDisabledSetting  = null;
let oldIconVertical     = null;
let oldResetPanel       = null;

// Dieser Hook wird aufgerufen, wenn die Einstellungen (SettingsConfig) gerendert werden.
// Kompatibel mit v13 (jQuery) und v14 (native HTMLElement).
Hooks.on('renderSettingsConfig', (app, html) => {
  const el = html instanceof HTMLElement ? html : html[0] ?? html;

  // Spieler ohne Freischaltung: gesamten Modul-Abschnitt ausblenden.
  const isGM        = game.user.isGM;
  const isAssistant = game.user.role === CONST.USER_ROLES.ASSISTANT;
  const visible     = game.settings.get(MODULE_ID, 'visibleToPlayers');
  if (!isGM && !isAssistant && !visible) {
    // Alle settings-Zeilen dieses Moduls verstecken.
    el.querySelectorAll(`[data-setting-id^="${MODULE_ID}."]`).forEach(row => {
      row.style.display = 'none';
    });
    // Modul-Überschrift (section/category-Header) ausblenden, falls vorhanden.
    el.querySelectorAll(`[data-category="${MODULE_ID}"], .module-header[data-module="${MODULE_ID}"]`).forEach(h => {
      h.style.display = 'none';
    });
    return;
  }

  // Aktuellen Stand der "disabledLocally"-Einstellung speichern.
  const disabledInput = el.querySelector(`input[name="${MODULE_ID}.disabledLocally"]`);
  oldDisabledSetting = disabledInput?.checked ?? null;

  // Aktuellen Stand der "resetPanelPosition"-Einstellung speichern.
  const resetPanelInput = el.querySelector(`input[name="${MODULE_ID}.resetPanelPosition"]`);
  oldResetPanel = resetPanelInput?.checked ?? null;

  // Aktuellen Stand der "iconVertical"-Einstellung speichern.
  const iconVerticalInput = el.querySelector(`input[name="${MODULE_ID}.iconVertical"]`);
  oldIconVertical = iconVerticalInput?.checked ?? null;

  // "showBennyMessages" deaktivieren, da systemseitig gesteuert.
  const bennyInput = el.querySelector(`input[name="${MODULE_ID}.showBennyMessages"]`);
  if (bennyInput) bennyInput.disabled = true;
});

// Dieser Hook wird ausgeführt, wenn das Einstellungsfenster geschlossen wird.
// Bei Änderungen der "disabledLocally"-Einstellung wird ein Neustart-Dialog angezeigt.
Hooks.on('closeSettingsConfig', () => {
  const newDisabled      = game.settings.get(MODULE_ID, 'disabledLocally');
  const newResetPanel    = game.settings.get(MODULE_ID, 'resetPanelPosition');
  const newIconVertical  = game.settings.get(MODULE_ID, 'iconVertical');

  const needsReload =
    (oldDisabledSetting   !== null && oldDisabledSetting   !== newDisabled)    ||
    (oldResetPanel        !== null && oldResetPanel         !== newResetPanel)  ||
    (oldIconVertical      !== null && oldIconVertical       !== newIconVertical);
  if (needsReload) {
    const DialogClass = foundry.applications?.api?.DialogV2;
    if (DialogClass) {
      DialogClass.confirm({
        window: { title: game.i18n.localize('ARGAS_BENNY_WOUND.DIALOG.RELOAD_TITLE') },
        content: `<p>${game.i18n.localize('ARGAS_BENNY_WOUND.DIALOG.RELOAD_CONTENT')}</p>`,
        yes: { callback: () => window.location.reload() }
      });
    } else {
      // Fallback auf Legacy Dialog (sollte in v13+ nicht nötig sein).
      new Dialog({
        title: game.i18n.localize('ARGAS_BENNY_WOUND.DIALOG.RELOAD_TITLE'),
        content: `<p>${game.i18n.localize('ARGAS_BENNY_WOUND.DIALOG.RELOAD_CONTENT')}</p>`,
        buttons: {
          yes: { label: game.i18n.localize('Yes'), callback: () => window.location.reload() },
          no:  { label: game.i18n.localize('No') }
        },
        default: 'yes'
      }).render(true);
    }
  }
});
