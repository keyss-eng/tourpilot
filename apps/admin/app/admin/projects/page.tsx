import { redirect } from 'next/navigation';

// The clients list now lives under /admin/users. Keep this path working for old
// links/bookmarks — the [id] detail page still lives in this folder.
export default function AdminProjectsRedirect() {
  redirect('/admin/users');
}
