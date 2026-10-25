import { Component, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { AlertsPage } from "./pages/Alerts";
import { BooksPage } from "./pages/Books";
import { DeskPage } from "./pages/Desk";
import { NotFoundPage, SymbolPage } from "./pages/Symbol";

interface BoundaryState {
  message: string | null;
}

class Boundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { message: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { message: error.message };
  }

  render() {
    if (this.state.message) {
      return (
        <main className="page">
          <h1>The desk hit an error</h1>
          <p>{this.state.message}</p>
        </main>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <Boundary>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<DeskPage />} />
          <Route path="symbol/:ticker" element={<SymbolPage />} />
          <Route path="books" element={<BooksPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Boundary>
  );
}
