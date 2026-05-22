# Changelog
## 14.0.2
- Ensured full compatibility with Foundry VTT v14 and SWADE v6
- Fixed: Clicking a panel button while no scene is active no longer triggers an error
- Improved: Players attempting to modify tokens that aren't theirs now receive a clear notification
- Improved: The compact icon now switches between horizontal and vertical orientation instantly, without requiring a reload
- Improved: Left-clicking the compact icon now shows a pointer cursor instead of a grab cursor, distinguishing it from right-click dragging
- Improved: Cleaned up ineffective CSS
## 13.0.1
- Initial release
- Floating panel for quick adjustment of Bennies, Wounds, and Fatigue on selected tokens
- Multi-token support — apply changes to several selected tokens at once
- Drag & snap to Sidebar, Hotbar, Navigation, screen edges, and open Foundry windows
- Docking to the Players window and Scene Navigation, with independent docking for the compact icon
- Collapsible compact mode with a draggable icon
- Chat output for Wounds, Fatigue, and Bennies, including vehicle-specific wound messages
- Simple chat message mode for short notifications without the detailed explanatory text
- Dice So Nice support for the Benny throw animation
- `faded-ui` support — respects Foundry's Inactive Opacity and Fade Speed settings
- UI scale support via Foundry's `--ui-scale` CSS variable
- German and English localization
