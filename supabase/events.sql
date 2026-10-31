-- Events and points. Run this file once in the Supabase SQL editor.
--
-- Settings now holds a catalogue instead of a flat sport list: a category
-- (Sports, Academics, Special) contains events, and each event carries its own
-- award table. That is nested data, so it lives in a jsonb column.
--
-- Until this runs the portal still works, but the catalogue saves on the browser
-- you edited it with and the Settings tab warns you about that.

alter table public.app_settings
  add column if not exists events jsonb not null default '[]'::jsonb;

-- Bring across the events a project already has. The app re-derives the sports
-- array on every save, so the two columns stay in step without more SQL.
do $$
declare
  names text[];
begin
  select sports into names from public.app_settings where id = 1;

  if coalesce(array_length(names, 1), 0) = 0 then
    return;
  end if;

  update public.app_settings
     set events = jsonb_build_object(
           'id', 'sports',
           'name', 'Sports',
           'events', (
             select jsonb_agg(jsonb_build_object(
                      'id', substr(md5(s), 1, 12),
                      'name', s,
                      'entryPoints', 10,
                      'noEntryPoints', 0,
                      'placements', jsonb_build_array(
                        jsonb_build_object('id', 'p1', 'label', 'Champion',      'points', 20),
                        jsonb_build_object('id', 'p2', 'label', '1st Runner-up', 'points', 15),
                        jsonb_build_object('id', 'p3', 'label', '2nd Runner-up', 'points', 15)
                      )
                    ) order by s)
               from unnest(names) as s
           )
         )
   where id = 1
     -- Never overwrite a catalogue somebody already built in the portal.
     and coalesce(events, '[]'::jsonb) = '[]'::jsonb;
end;
$$;
