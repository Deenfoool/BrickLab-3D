# BrickLab workspace UI

BrickLab uses a scene-first editor layout: the 3D viewport owns the full workspace and editor panels float above it instead of reserving permanent left/right columns.

## Floating panels

The main overlays are:

- **Parts** — searchable part catalog.
- **Properties** — transform, appearance and mechanics inspector.

Both panels can be shown/hidden from the top bar or closed from their own header.

On desktop, panel state and custom layout are persisted in `localStorage`.

## Drag and resize

Desktop panels can be dragged by their header and resized horizontally from the outer edge.

Stored layout data includes:

- X position;
- Y position;
- width.

Positions are clamped back into the available workspace if the browser window becomes smaller.

The **Reset layout** button clears only custom positions/sizes and returns panels to their default left/right locations. It does not reset the project.

## Focus Scene

**Focus Scene** temporarily hides both floating panels so a large construction can be inspected without UI obstruction.

Entering Focus Scene remembers which panels were visible. Leaving it restores that temporary state without overwriting the user's saved open/closed preferences.

## Parts catalog views

The Parts panel supports two presentation modes:

- **List** — detailed rows with part description.
- **Grid** — compact asset-browser cards.

The selected mode is persisted independently of panel position.

## Properties sections

Properties sections are independently collapsible:

- Transform;
- Rotation;
- Appearance;
- Mechanics.

Collapsed state is persisted. The selected-part card stays visible at the top while the inspector scrolls.

## Mobile behavior

At `800px` and below the floating-window behavior is intentionally simplified:

- panels become left/right drawers;
- only one drawer is open at a time;
- drag and resize are disabled;
- a scene scrim closes the active drawer when clicked;
- `Esc` closes the active drawer;
- Parts uses the list layout for touch-friendly rows.

This keeps the same scene-first model without forcing desktop window-management interactions onto touch devices.
