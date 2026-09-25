import {
  CreateTodoRequestSchema,
  TODOS_PATH,
  TodoListResponseSchema,
  TodoSchema,
} from "@todos/shared"
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

    app.post(
      TODOS_PATH,
      {
        schema: {
          body: CreateTodoRequestSchema,
          response: { 200: TodoSchema, 201: TodoSchema },
        },
      },
      async (request, reply) => {
        const { todo, created } = await deps.todoService.create(
          request.ctx,
          request.body
        )
        return reply.code(created ? 201 : 200).send(todo)
      }
    )
  }
}
