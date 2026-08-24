DROP TRIGGER local_task_tag_catalog_color_exclusive_insert;
DROP TRIGGER local_task_tag_catalog_color_exclusive_update;

CREATE TABLE local_task_tag_migration_guard (
  is_valid INTEGER NOT NULL CHECK (is_valid = 1)
);

CREATE TABLE local_task_tag_catalog_new (
  id TEXT PRIMARY KEY NOT NULL,
  normalized_tag TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL,
  color TEXT CHECK (color IS NULL OR color IN ('amber', 'blue', 'green', 'purple', 'red', 'teal')),
  custom_color TEXT CHECK (custom_color IS NULL OR custom_color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (color IS NULL OR custom_color IS NULL)
);
INSERT INTO local_task_tag_catalog_new (id, normalized_tag, tag, color, custom_color, created_at, updated_at)
SELECT lower(hex(randomblob(16))), normalized_tag, tag, color, custom_color, created_at, updated_at
FROM local_task_tag_catalog;
INSERT INTO local_task_tag_migration_guard (is_valid)
SELECT CASE WHEN (SELECT COUNT(*) FROM local_task_tag_catalog) = (SELECT COUNT(*) FROM local_task_tag_catalog_new)
  THEN 1 ELSE 0 END;

CREATE TABLE local_task_tag_catalog_aliases_new (
  tag_id TEXT NOT NULL REFERENCES local_task_tag_catalog_new(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (tag_id, tag)
);
INSERT INTO local_task_tag_catalog_aliases_new (tag_id, tag)
SELECT catalog.id, aliases.tag
FROM local_task_tag_catalog_aliases AS aliases
JOIN local_task_tag_catalog_new AS catalog ON catalog.normalized_tag = aliases.normalized_tag;
INSERT INTO local_task_tag_migration_guard (is_valid)
SELECT CASE WHEN (SELECT COUNT(*) FROM local_task_tag_catalog_aliases) = (SELECT COUNT(*) FROM local_task_tag_catalog_aliases_new)
  THEN 1 ELSE 0 END;

CREATE TABLE local_task_tags_new (
  local_task_id TEXT NOT NULL REFERENCES local_tasks(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES local_task_tag_catalog_new(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (local_task_id, tag_id),
  UNIQUE (local_task_id, position)
);
INSERT INTO local_task_tags_new (local_task_id, tag_id, position, created_at)
SELECT relations.local_task_id, catalog.id, relations.position, relations.created_at
FROM local_task_tags AS relations
JOIN local_task_tag_catalog_new AS catalog ON catalog.normalized_tag = relations.normalized_tag;
INSERT INTO local_task_tag_migration_guard (is_valid)
SELECT CASE WHEN (SELECT COUNT(*) FROM local_task_tags) = (SELECT COUNT(*) FROM local_task_tags_new)
  THEN 1 ELSE 0 END;
DROP TABLE local_task_tag_migration_guard;

DROP TABLE local_task_tags;
DROP TABLE local_task_tag_catalog_aliases;
DROP TABLE local_task_tag_catalog;
ALTER TABLE local_task_tag_catalog_new RENAME TO local_task_tag_catalog;
ALTER TABLE local_task_tag_catalog_aliases_new RENAME TO local_task_tag_catalog_aliases;
ALTER TABLE local_task_tags_new RENAME TO local_task_tags;
CREATE INDEX idx_local_task_tags_tag_task ON local_task_tags(tag_id, local_task_id);
CREATE TRIGGER local_task_tag_catalog_color_exclusive_insert
BEFORE INSERT ON local_task_tag_catalog
WHEN NEW.color IS NOT NULL AND NEW.custom_color IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'local task tag colors are mutually exclusive'); END;
CREATE TRIGGER local_task_tag_catalog_color_exclusive_update
BEFORE UPDATE OF color, custom_color ON local_task_tag_catalog
WHEN NEW.color IS NOT NULL AND NEW.custom_color IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'local task tag colors are mutually exclusive'); END;
