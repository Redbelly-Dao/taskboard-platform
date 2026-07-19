import { redirect } from "next/navigation";

// The admin dashboard is split into per-tab routes under /admin/*.
// The index sends you to the first tab; the sidebar (in app/admin/layout.tsx) handles the rest.
// Shared state lives in AdminProvider, which the layout mounts so it persists across tab navigation.
export default function AdminIndex() {
  redirect("/admin/submissions");
}
