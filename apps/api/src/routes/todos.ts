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
import { z } from "zod"

import { errorResponses } from "../openapi"
import type { TodoService } from "../services/todo-service"

export function todoRoutes(deps: {
  todoService: TodoService
}): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      TODOS_PATH,
      {
        schema: {
          response: {
            200: TodoListResponseSchema.describe("Every Todo, newest first"),
            ...errorResponses(400, 500, 503),
          },
        },
      },
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
          response: {
            200: TodoSchema.describe(
              "Already stored with the same Description (idempotent repeat)"
            ),
            201: TodoSchema.describe("Created"),
            ...errorResponses(400, 409, 413, 415, 500, 503),
          },
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
          response: {
            200: TodoSchema.describe("The updated (or unchanged) Todo"),
            ...errorResponses(400, 404, 413, 415, 500, 503),
          },
        },
      },
      async (request) =>
        deps.todoService.update(request.ctx, request.params.id, request.body)
    )

    app.delete(
      TODO_PATH,
      {
        schema: {
          params: TodoIdParamsSchema,
          response: {
            // Documents the empty 204; the handler sends no body at all.
            204: z.null().describe("No content"),
            ...errorResponses(400, 404, 413, 415, 500, 503),
          },
        },
      },
      async (request, reply) => {
        await deps.todoService.delete(request.ctx, request.params.id)
        // `null` matches the documented 204 schema; Fastify sends no body.
        return reply.code(204).send(null)
      }
    )
  }
}
