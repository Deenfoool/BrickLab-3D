-- Reject route collisions for new registrations; keep old handles and links intact.
CREATE OR REPLACE FUNCTION bricklab.assign_username() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,bricklab AS $$
 DECLARE candidate text; reserved text[]:=ARRAY['home','projects','examples','library','sets','account','community','store','project','editor','admin','workshop','profile','privacy','terms','api','login','register','settings','achievements','notifications','help','about','support','tutorial','rankings','logout'];
 BEGIN
 IF NEW.username IS NOT NULL THEN
  IF NEW.username=ANY(reserved) THEN RAISE EXCEPTION 'reserved username' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 candidate:=lower(btrim(NEW.display_name));
 PERFORM pg_advisory_xact_lock(820491109);
 IF candidate ~ '^[a-z0-9][a-z0-9_.-]{2,31}$' AND left(candidate,3)<>'id_' AND NOT candidate=ANY(reserved) AND NOT EXISTS(SELECT 1 FROM bricklab.users WHERE username=candidate) THEN NEW.username:=candidate;
 ELSE NEW.username:='id_'||replace(NEW.id::text,'-',''); END IF;
 RETURN NEW;
 END $$;
