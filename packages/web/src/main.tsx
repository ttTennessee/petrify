import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./i18n";
import App from "./App";
import ProjectList from "./routes/ProjectList";
import ProjectNew from "./routes/ProjectNew";
import ProjectDetail from "./routes/ProjectDetail";
import WorkflowEditor from "./routes/WorkflowEditor";
import Templates from "./routes/Templates";
import Adapters from "./routes/Adapters";
import { ThemeProvider } from "./components/theme-provider";
import "./index.css";

const queryClient = new QueryClient();

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <ProjectList /> },
      { path: "projects/new", element: <ProjectNew /> },
      { path: "projects/:projectId", element: <ProjectDetail /> },
      { path: "workflows/:workflowId", element: <WorkflowEditor /> },
      { path: "templates", element: <Templates /> },
      { path: "adapters", element: <Adapters /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
