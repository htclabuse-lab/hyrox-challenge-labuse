-- ============================================================================
-- PLATEFORME PHOTOS — étape 3 : recherche « en deux temps »
-- Renvoie les VISAGES (pas seulement les photos) les plus proches d'une empreinte,
-- avec leur propre empreinte : elles servent à relancer une 2e recherche.
-- ============================================================================
create or replace function public.photos_visages_proches(
  p_evenement text,
  p_empreinte extensions.vector(128),
  p_seuil     real    default 0.5,
  p_max       integer default 5
)
returns table (photo_id uuid, distance real, empreinte text)
language sql stable
set search_path = public, extensions
as $$
  select v.photo_id, (v.empreinte <-> p_empreinte)::real as distance, v.empreinte::text
  from photos_visages v
  join photos_fichiers f on f.id = v.photo_id
  where v.evenement_id = p_evenement
    and f.statut = 'pret'
    and (v.empreinte <-> p_empreinte) < p_seuil
  order by distance
  limit p_max;
$$;

revoke execute on function public.photos_visages_proches(text, extensions.vector, real, integer) from public, anon, authenticated;
grant  execute on function public.photos_visages_proches(text, extensions.vector, real, integer) to service_role;
