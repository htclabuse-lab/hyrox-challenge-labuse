-- ============================================================================
-- PLATEFORME PHOTOS — effacement automatique des empreintes de visage
-- 60 jours (conservation_jours) après l'ouverture de l'événement aux athlètes.
-- Ne touche QUE photos_visages (données biométriques). Les photos, les accès
-- débloqués et les photos offertes restent : les espaces photo continuent de marcher.
-- ============================================================================
create extension if not exists pg_cron;

-- 1) La date d'ouverture est posée automatiquement quand l'événement passe « ouvert ».
create or replace function public.photos_evt_ouverture() returns trigger
language plpgsql as $$
begin
  if new.statut = 'ouvert' and new.ouvert_le is null then
    new.ouvert_le := now();
  end if;
  return new;
end $$;
drop trigger if exists photos_evt_ouverture on public.photos_evenements;
create trigger photos_evt_ouverture before insert or update of statut on public.photos_evenements
  for each row execute function public.photos_evt_ouverture();

-- 2) Effacement des visages des événements arrivés au terme.
--    Événement jamais ouvert : on compte depuis sa création (sécurité).
create or replace function public.photos_effacer_visages_expires() returns integer
language plpgsql security definer set search_path = public as $$
declare e record; n integer := 0; k integer;
begin
  for e in
    select id from photos_evenements
    where visages_effaces_le is null
      and coalesce(ouvert_le, created_at) + make_interval(days => conservation_jours) < now()
  loop
    delete from photos_visages where evenement_id = e.id;
    get diagnostics k = row_count;
    n := n + k;
    update photos_evenements set visages_effaces_le = now() where id = e.id;
  end loop;
  return n;
end $$;
revoke execute on function public.photos_effacer_visages_expires() from public, anon, authenticated;

-- 3) Tous les jours à 3 h UTC (7 h à La Réunion).
select cron.unschedule('photos-effacement-visages')
  where exists (select 1 from cron.job where jobname = 'photos-effacement-visages');
select cron.schedule('photos-effacement-visages', '0 3 * * *', 'select public.photos_effacer_visages_expires()');

-- ============================================================================
-- Ajout du 29/10/2026 : conservation des PHOTOS 6 mois après la date de l'événement
-- (fichiers R2 supprimés par une règle de cycle de vie Cloudflare).
-- ============================================================================
alter table public.photos_evenements add column if not exists conservation_photos_mois integer not null default 6;
alter table public.photos_evenements add column if not exists photos_effacees_le timestamptz;
-- + nouvelle version de photos_effacer_visages_expires() : bloc 2 qui supprime
--   photos_acces, photos_gratuites et photos_fichiers de l'événement (voir Supabase).
