import { createCn } from "cn/config"

/**
 * Class merging (clsx + tailwind-merge semantics) that knows the project's
 * custom font-size tokens (the `--text-*` type roles in `src/index.css`), so
 * `cn("text-meta", "text-muted-foreground")` keeps both: unregistered, the
 * merge would read `text-meta` as a colour and drop it.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["app-title", "todo-description", "meta", "empty-title"] },
      ],
    },
  },
})
