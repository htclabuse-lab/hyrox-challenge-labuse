-- ============================================================================
-- PLATEFORME PHOTOS — étape 2B : fonction de recherche + fiches événements
-- ============================================================================

-- Recherche : renvoie les photos d'un événement où un visage ressemble à l'empreinte
-- du selfie (distance < seuil ; plus c'est petit, plus c'est ressemblant).
create or replace function public.photos_rechercher(
  p_evenement text,
  p_empreinte extensions.vector(128),
  p_seuil     real    default 0.5,
  p_max       integer default 300
)
returns table (photo_id uuid, distance real)
language sql stable
set search_path = public, extensions
as $$
  select v.photo_id, min(v.empreinte <-> p_empreinte)::real as distance
  from photos_visages v
  join photos_fichiers f on f.id = v.photo_id
  where v.evenement_id = p_evenement
    and f.statut = 'pret'
    and (v.empreinte <-> p_empreinte) < p_seuil
  group by v.photo_id
  order by distance
  limit p_max;
$$;

-- Seul le serveur (service_role) peut appeler la recherche
revoke execute on function public.photos_rechercher(text, extensions.vector, real, integer) from public, anon, authenticated;
grant  execute on function public.photos_rechercher(text, extensions.vector, real, integer) to service_role;

-- Fiches des deux événements de novembre (statut 'brouillon' = pas encore visibles)
insert into public.photos_evenements (id, nom, date_evenement, type, inscriptions_depuis, compte_stripe)
values
  ('hc3', 'Hyrox Challenge La Buse #3',  '2026-11-15', 'hyrox',         '2026-07-19', 'hyrox'),
  ('pe2', 'Hyrox Parents / Enfants #2',  '2026-11-14', 'parent_enfant', '2026-09-01', 'training_club')
on conflict (id) do nothing;
