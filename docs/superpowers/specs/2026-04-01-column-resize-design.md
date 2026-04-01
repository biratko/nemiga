# Column Separators & Resizable Columns

## Summary

Add visible column separators in file panel headers and allow users to resize columns by dragging the separator with the mouse. Column widths persist per-panel (left/right) and separately for search mode via the Workspace API.

## Visual Design

- **Header separators**: Short vertical lines centered vertically in the header row, placed between adjacent column headers.
- **Row separators**: None — data rows remain clean without vertical dividers.
- **Drag affordance**: Cursor changes to `col-resize` when hovering near a separator, indicating it can be dragged.

## Column Width Storage

Three independent sets of column widths stored in Workspace state:

| Context | Columns | Defaults (%) |
|---------|---------|--------------|
| Left panel | name, size, date | 60, 20, 20 |
| Right panel | name, size, date | 60, 20, 20 |
| Search mode | name, path, size, date | 35, 30, 15, 20 |

Search mode uses its own widths regardless of which panel displays the results.

### Type Definition

```typescript
interface ColumnWidths {
  name: number
  size: number
  date: number
}

interface SearchColumnWidths extends ColumnWidths {
  path: number
}
```

These are added to the workspace state alongside existing panel data.

## Resize Behavior

- Dragging a separator adjusts the two adjacent columns: the left column and the right column change width inversely.
- All widths are stored as percentages of the table width (summing to 100%).
- Minimum column width: enough to fit the header text (enforced during drag).
- Live update during drag — columns resize in real time as the mouse moves.
- On mouse release: save updated widths to Workspace API (`PUT /api/workspace`).

## Implementation Scope

### New Files

- `frontend/src/composables/useColumnResize.ts` — composable encapsulating drag logic, width state, min-width enforcement, and save-on-release.

### Modified Files

- `frontend/src/components/FilePanel.vue` — render separators in `<thead>`, apply dynamic column widths via inline styles, wire up the composable.
- `frontend/src/types/workspace.ts` — add `ColumnWidths` and `SearchColumnWidths` types, extend workspace panel types.
- `backend/src/protocol/workspace-types.ts` — mirror the column width types server-side.
- `backend/src/api/workspace.ts` — extend sanitization to accept column width fields.

### Not In Scope

- Column visibility toggling (show/hide columns).
- Column reordering by drag-and-drop.
- Per-tab column widths (widths are per-panel, not per-tab).
