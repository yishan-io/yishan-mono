ALTER TABLE local_task_tag_catalog
  ADD COLUMN custom_color TEXT CHECK (
    custom_color IS NULL OR custom_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
  );

CREATE TRIGGER local_task_tag_catalog_color_exclusive_insert
BEFORE INSERT ON local_task_tag_catalog
WHEN NEW.color IS NOT NULL AND NEW.custom_color IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'local task tag colors are mutually exclusive');
END;

CREATE TRIGGER local_task_tag_catalog_color_exclusive_update
BEFORE UPDATE OF color, custom_color ON local_task_tag_catalog
WHEN NEW.color IS NOT NULL AND NEW.custom_color IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'local task tag colors are mutually exclusive');
END;
