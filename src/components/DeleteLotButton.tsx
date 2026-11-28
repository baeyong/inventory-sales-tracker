"use client";

import { deleteLot } from "@/app/(app)/lots/actions";
import { btnDanger } from "@/lib/ui";

export default function DeleteLotButton({ lotId }: { lotId: string }) {
  return (
    <form
      action={deleteLot}
      onSubmit={(e) => {
        if (!confirm("Delete this lot permanently?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={lotId} />
      <button type="submit" className={btnDanger}>
        Delete
      </button>
    </form>
  );
}
