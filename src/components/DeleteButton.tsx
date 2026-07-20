"use client";

import { deleteItem } from "@/app/(app)/actions";

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
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
      >
        Delete item
      </button>
    </form>
  );
}
