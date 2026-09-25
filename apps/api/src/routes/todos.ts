import { TODOS_PATH, TodoListResponseSchema } from "@todos/shared"
import type { FastifyPluginAsyncZod } from "@fastify/type-provider-zod"

import type { TodoService } from "../services/todo-service"

export function todoRoutes(deps: {
  todoService: TodoService
}): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      TODOS_PATH,
      { schema: { response: { 200: TodoListResponseSchema } } },
      async (request) => {
        const todos = await deps.todoService.list(request.ctx)
        return { todos }
      }
    )
  }
}
