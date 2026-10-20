-- ============================================================================
-- PLATEFORME PHOTOS — étape 2A : extension + 4 tables
-- Ne touche à AUCUNE table existante. Peut être relancé sans danger.
-- ============================================================================

-- Outil de comparaison des « empreintes » de visage (pgvector)
create extension if not exists vector with schema extensions;

-- 1) Un événement = une fiche (HC #3, Parent-Enfant #2, futurs...)
create table if not exists public.photos_evenements (
  id                   text primary key,              -- code court : 'hc3', 'pe2'
  nom                  text not null,
  date_evenement       date not null,
  type                 text not null check (type in ('hyrox', 'parent_enfant')),
  inscriptions_depuis  timestamptz not null,          -- quelles inscriptions en font partie
  compte_stripe        text not null check (compte_stripe in ('hyrox', 'training_club')),
  prix_pack_cents      integer not null default 2000, -- 20,00 €
  nb_gratuites         integer not null default 3,
  conservation_jours   integer not null default 60,   -- effacement des visages
  statut               text not null default 'brouillon'
                       check (statut in ('brouillon', 'ouvert', 'ferme')),
  ouvert_le            timestamptz,                   -- mise en ligne -> départ des 60 jours
  visages_effaces_le   timestamptz,
  created_at           timestamptz not null default now()
);

-- 2) Une ligne par photo (les fichiers eux-mêmes sont dans R2)
create table if not exists public.photos_fichiers (
  id              uuid primary key default gen_random_uuid(),
  evenement_id    text not null references public.photos_evenements(id) on delete cascade,
  photographe     text not null,
  nom_origine     text not null,
  largeur         integer,
  hauteur         integer,
  taille_octets   bigint,
  prise_le        timestamptz,
  nb_visages      integer not null default 0,
  statut          text not null default 'en_cours' check (statut in ('en_cours', 'pret')),
  created_at      timestamptz not null default now(),
  unique (evenement_id, photographe, nom_origine)  -- évite les doublons / permet la reprise
);
create index if not exists photos_fichiers_evt_idx on public.photos_fichiers (evenement_id);

-- 3) Les empreintes de visage (DONNÉES BIOMÉTRIQUES — effacées après conservation_jours)
create table if not exists public.photos_visages (
  id            uuid primary key default gen_random_uuid(),
  photo_id      uuid not null references public.photos_fichiers(id) on delete cascade,
  evenement_id  text not null references public.photos_evenements(id) on delete cascade,
  empreinte     extensions.vector(128) not null,
  cadre         jsonb,         -- position du visage dans la photo {x,y,w,h}
  score         real,          -- confiance de la détection
  created_at    timestamptz not null default now()
);
create index if not exists photos_visages_evt_idx on public.photos_visages (evenement_id);

-- 4) Les accès débloqués (pack payé à l'inscription OU acheté en ligne)
--    Aucune donnée de visage ici : seulement la liste des photos débloquées.
create table if not exists public.photos_acces (
  id                 uuid primary key default gen_random_uuid(),
  evenement_id       text not null references public.photos_evenements(id) on delete cascade,
  inscription_id     bigint not null references public."Inscriptions"(id) on delete cascade,
  origine            text not null check (origine in ('pack_inscription', 'achat_en_ligne')),
  statut             text not null default 'en_attente' check (statut in ('en_attente', 'actif')),
  jeton              text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  photo_ids          uuid[] not null default '{}',
  nb_visages         integer not null default 0,     -- plafond : 1 Solo, 2 Duo/P-E, 4 Relais
  stripe_session_id  text unique,
  montant_cents      integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (evenement_id, inscription_id)
);

-- Sécurité : tables fermées au public, seul le serveur (service_role) y accède
alter table public.photos_evenements enable row level security;
alter table public.photos_fichiers   enable row level security;
alter table public.photos_visages    enable row level security;
alter table public.photos_acces      enable row level security;
