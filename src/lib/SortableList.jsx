import React from "react";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ---------------------------------------------------------------------------
// One reusable sortable list for the whole app (stages, tasks, projects,
// clients, finance). Replaces the old native HTML5 drag, which gave no live
// movement and did not work on touch screens at all.
//
// How it behaves:
//  - Desktop: press and drag a row; it lifts and follows the cursor, the other
//    rows animate out of the way.
//  - Mobile: press-hold ~180ms then drag. The short delay means normal taps on
//    buttons inside a row (status pills, edit, delete) still register as taps,
//    not accidental drags.
//  - A drag "handle" (the grip icon) is the grab point, so interactive controls
//    in the row keep working normally.
// ---------------------------------------------------------------------------

// Each draggable row. `renderChild` receives drag props to attach to a handle.
function SortableRow({ id, children, handle }) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : "auto",
    position: "relative",
    touchAction: "manipulation",
  };

  // The child is a function so the row can place the drag handle exactly where
  // it wants. We pass the handle props (ref + listeners) through.
  return (
    <div ref={setNodeRef} style={style}>
      {children({
        handleProps: { ref: setActivatorNodeRef, ...attributes, ...listeners,
          style: { cursor: "grab", touchAction: "none" } },
        isDragging,
      })}
    </div>
  );
}

// items: array of objects each having a stable `id`.
// onReorder: (newOrderedIds) => void  — fires after a successful drop.
// renderItem: (item, { handleProps, isDragging }) => JSX
export default function SortableList({ items, onReorder, renderItem, disabled }) {
  const sensors = useSensors(
    // Mouse/trackpad: tiny distance threshold so a click isn't a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Touch: short hold before drag starts, so taps on inner buttons still work.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map((i) => i.id);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  if (disabled) {
    // Render plainly with no drag wiring (e.g. when a filter is active).
    return <>{items.map((it) => renderItem(it, { handleProps: {}, isDragging: false }))}</>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {items.map((it) => (
          <SortableRow key={it.id} id={it.id}>
            {(rowProps) => renderItem(it, rowProps)}
          </SortableRow>
        ))}
      </SortableContext>
    </DndContext>
  );
}
