// `pnpm api:docs`: writes the committed OpenAPI snapshot, docs/api/openapi.json.
// Builds the app with a pool that never connects, so no database is needed.
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, relative, resolve } from "node:path"

import {
  generateOpenApiDocument,
  serializeOpenApiDocument,
} from "../src/openapi"

const REPO_ROOT = resolve(import.meta.dirname, "../../..")
const SNAPSHOT_PATH = resolve(REPO_ROOT, "docs/api/openapi.json")

const doc = await generateOpenApiDocument()
await mkdir(dirname(SNAPSHOT_PATH), { recursive: true })
await writeFile(SNAPSHOT_PATH, serializeOpenApiDocument(doc))
console.log(`wrote ${relative(REPO_ROOT, SNAPSHOT_PATH)}`)
