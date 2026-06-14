-- Fix admin login: RLS was enabled on admin_users without a SELECT policy.
-- Run in SQL Editor if 002 was applied before this fix (permission denied for table admin_users).

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_users' and policyname = 'admin_users_select_self'
  ) then
    create policy admin_users_select_self
      on public.admin_users for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end$$;
