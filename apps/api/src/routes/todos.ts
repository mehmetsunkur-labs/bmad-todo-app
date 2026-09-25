import {
  CreateTodoRequestSchema,
  TODO_PATH,
  TODOS_PATH,
  TodoIdParamsSchema,
  TodoListResponseSchema,
  TodoSchema,
  UpdateTodoRequestSchema,
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

    app.patch(
      TODO_PATH,
      {
        schema: {
          params: TodoIdParamsSchema,
          body: UpdateTodoRequestSchema,
          response: { 200: TodoSchema },
        },
      },
      async (request) =>
        deps.todoService.update(request.ctx, request.params.id, request.body)
    )

    app.delete(
      TODO_PATH,
      { schema: { params: TodoIdParamsSchema } },
      async (request, reply) => {
        await deps.todoService.delete(request.ctx, request.params.id)
        return reply.code(204).send()
      }
    )
  }
}
