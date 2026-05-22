# Changelog
## 14.0.1
- Ensured full compatibility with Foundry VTT v14
- Fixed: The `argas:widgetMoved` synchronization listener is now properly removed on every scene change instead of being registered repeatedly
- Improved: Cleaned up ineffective CSS
## 13.0.3
- Added: Cross-module docking support with Arga's Benny & Wound Panel via the window.ArgasMods registry and argas:widgetMoved CustomEvent
- Fixed: Scene Navigation docking now uses a MutationObserver instead of ResizeObserver, fixing an issue where the widget position was not updated when the navigation was collapsed or expanded
- Improved: Players pin zone extended to the left and bottom screen edges for more reliable docking
## 13.0.2
- Fixed: Widget now always stays fully within the viewport and shifts correctly when the Sidebar opens or closes
- Added: `faded-ui` support — the widget now respects Foundry's Inactive Opacity and Fade Speed settings
- Added: Right-click anywhere on the widget to drag it (in addition to the handle)
- Added: Viewport clamping — the widget can no longer be dragged outside the browser window
- Added: Snap target caching for improved performance during drag
- Improved: Snap lines adjusted for more accurate snapping behavior
## 13.0.1
- Initial release
- Floating slider for adjusting scene darkness level
- Drag & snap to Sidebar, Hotbar, Navigation, screen edges, and open Foundry windows
- Docking to the Players window with wiggle animation feedback
- Mouse wheel support (scroll ±1%, Shift ±5%, Ctrl ±0.3%)
- Click Sun icon to set full daylight, Moon icon to set full darkness
- Double-click handle to snap back to Players window
- UI scale support via Foundry's `--ui-scale` CSS variable
- Position persistence across sessions
