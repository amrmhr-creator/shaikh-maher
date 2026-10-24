import type { APIRoute } from 'astro';
import { clearSession } from '../../lib/auth';
import { u } from '../../lib/site';

export const POST: APIRoute = ({ cookies, redirect }) => {
  clearSession(cookies);
  return redirect(u('/admin/login/'), 303);
};
