-- Étape 4 : un accès par PERSONNE (email) et non plus par inscription (Duo : chacun son espace)
alter table public.photos_acces add column if not exists email text;
alter table public.photos_acces drop constraint if exists photos_acces_evenement_id_inscription_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'photos_acces_evt_insc_email_key') then
    alter table public.photos_acces add constraint photos_acces_evt_insc_email_key unique (evenement_id, inscription_id, email);
  end if;
end $$;
