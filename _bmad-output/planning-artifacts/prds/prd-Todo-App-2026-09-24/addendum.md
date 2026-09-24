# Todo-App PRD — Addendum

Technical direction the product owner volunteered during PRD discovery. It is recorded here for `bmad-architecture` and is not a product requirement.

## Delivery and runtime (from the product owner, 2026-09-24)

- **Docker:** the frontend, the Todo API, and the persistent store each run in a container.
- **Docker Compose:** the standard way to run the stack for local development and debugging. The goal is one command (`docker compose up`) to bring everything up.
- **Persistence:** use a named Docker volume for the store, so data survives `docker compose down` / `up` and rebuilds. Note that `docker compose down -v` deliberately deletes it.
- **Debugging:** architecture should consider whether to add source mounts and hot reload for the frontend and API in the dev Compose setup, plus an exposed debugger port for the API.
- **Deployment:** the product owner deploys manually by running the same Compose setup on one host, so the app is reachable over the network (for example, from a phone). There is no deployment team, CI/CD pipeline, or hardened production environment in v1 scope.
- **README warning:** `docker compose down -v` deletes the data volume. With no backups, it is the one way to lose data by accident.
- **Out of scope for now:** backups, TLS, a reverse proxy, scaling, monitoring and alerting, and secrets management beyond environment files.
