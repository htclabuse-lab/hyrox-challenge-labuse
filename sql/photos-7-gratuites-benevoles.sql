-- Photos offertes aux BÉNÉVOLES (20/11/2026) : 3 par bénévole et par événement, selon son jour
-- (samedi = PE, dimanche = HC). Pas de pack pour eux. Clé = email (un bénévole peut avoir plusieurs fiches).
create table if not exists public.photos_gratuites_benevoles (
  evenement_id  text   not null references public.photos_evenements(id) on delete cascade,
  email         text   not null,
  photo_ids     uuid[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (evenement_id, email)
);
alter table public.photos_gratuites_benevoles enable row level security;
