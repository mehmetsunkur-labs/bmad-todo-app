import type { Todo } from "@todos/shared"

import type { RequestContext } from "../context"
import type { TodoRepository } from "../repositories/todo-repository"

export interface TodoService {
  /** Every Todo, ordered by `compareTodos`. */
  list(ctx: RequestContext): Promise<Todo[]>
}

export function createTodoService(deps: {
  todoRepository: TodoRepository
}): TodoService {
  return {
    async list(ctx) {
      return deps.todoRepository.list(ctx)
    },
  }
}
