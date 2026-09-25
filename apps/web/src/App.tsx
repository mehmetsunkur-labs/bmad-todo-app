import { TodoList } from "@/features/todos/todo-list"

export function App() {
  return (
    <div className="px-gutter-mobile pt-page-top-mobile sm:px-gutter-desktop sm:pt-page-top-desktop">
      <div className="mx-auto w-full max-w-content">
        <header className="mb-header-gap">
          <h1 className="text-app-title">Todos</h1>
        </header>
        <main>
          <TodoList />
        </main>
      </div>
    </div>
  )
}

export default App
