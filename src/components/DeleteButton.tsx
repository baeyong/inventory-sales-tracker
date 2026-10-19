"use client";

import { deleteItem } from "@/app/(app)/actions";
import { btnDanger } from "@/lib/ui";

export default function DeleteButton({
  itemId,
  back = "/inventory",
}: {
  itemId: string;
  back?: "/inventory" | "/sales";
}) {
  return (
    <form
      action={deleteItem}
      onSubmit={(e) => {
        if (!confirm("Delete this item permanently?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={itemId} />
      <input type="hidden" name="back" value={back} />
      <button
        type="submit"
        className={btnDanger}
      >
        Delete
      </button>
    </form>
  );
}
