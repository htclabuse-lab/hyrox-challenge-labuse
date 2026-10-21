-- Photos offertes : 3 par ÉQUIPE (inscription), retenues côté serveur. Aucune donnée de visage ici.
create table if not exists public.photos_gratuites (
  evenement_id    text   not null references public.photos_evenements(id) on delete cascade,
  inscription_id  bigint not null references public."Inscriptions"(id) on delete cascade,
  photo_ids       uuid[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (evenement_id, inscription_id)
);
alter table public.photos_gratuites enable row level security;
