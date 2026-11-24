CREATE FUNCTION bricklab.guard_bureau_member_update() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_user='bricklab_app' AND bricklab.bureau_role(OLD.bureau_id)<>'owner' THEN
  IF OLD.user_id IS DISTINCT FROM nullif(current_setting('bricklab.user_id',true),'')::uuid OR OLD.status<>'pending' OR NEW.status<>'active' OR NEW.role IS DISTINCT FROM OLD.role THEN
   RAISE EXCEPTION 'invalid membership transition' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END
$$;
CREATE TRIGGER bureau_member_update_guard BEFORE UPDATE ON bricklab.bureau_members FOR EACH ROW EXECUTE FUNCTION bricklab.guard_bureau_member_update();
