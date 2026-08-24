-- Migration 016: Replace dual color/custom_color fields with a single canonical
-- uppercase #RRGGBB hex color column.
--
-- Legacy preset-to-hex mapping (fixed values, documented for reference):
--   amber  → #F59E0B    blue   → #3B82F6    green  → #22C55E
--   purple → #A855F7    red    → #EF4444    teal   → #14B8A6
--
-- Merge rule: target color wins if set (matches MergeTags behavior).
-- custom_color values are promoted to color where color is NULL.
-- custom_color values are uppercased to produce canonical #RRGGBB form.

DROP TRIGGER IF EXISTS local_task_tag_catalog_color_exclusive_insert;
DROP TRIGGER IF EXISTS local_task_tag_catalog_color_exclusive_update;

-- Rebuild catalog table without custom_color, converting colors during INSERT.
-- Using INSERT SELECT avoids violating the old preset CHECK constraint.
CREATE TABLE local_task_tag_catalog_new (
    id             TEXT PRIMARY KEY NOT NULL,
    normalized_tag TEXT NOT NULL UNIQUE,
    tag            TEXT NOT NULL,
    color          TEXT CHECK (
        color IS NULL OR (
            length(color) = 7 AND
            color GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'
        )
    ),
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
);

INSERT INTO local_task_tag_catalog_new (id, normalized_tag, tag, color, created_at, updated_at)
SELECT
    id,
    normalized_tag,
    tag,
    CASE
        WHEN color = 'amber'  THEN '#F59E0B'
        WHEN color = 'blue'   THEN '#3B82F6'
        WHEN color = 'green'  THEN '#22C55E'
        WHEN color = 'purple' THEN '#A855F7'
        WHEN color = 'red'    THEN '#EF4444'
        WHEN color = 'teal'   THEN '#14B8A6'
        WHEN color IS NOT NULL THEN color
        WHEN custom_color IS NOT NULL THEN upper(custom_color)
        ELSE NULL
    END,
    created_at,
    updated_at
FROM local_task_tag_catalog;

CREATE TABLE local_task_tag_migration_guard_016 (
    is_valid INTEGER NOT NULL CHECK (is_valid = 1)
);
INSERT INTO local_task_tag_migration_guard_016 (is_valid)
SELECT CASE
    WHEN (SELECT COUNT(*) FROM local_task_tag_catalog) = (SELECT COUNT(*) FROM local_task_tag_catalog_new)
    THEN 1 ELSE 0
END;
DROP TABLE local_task_tag_migration_guard_016;

DROP TABLE local_task_tag_catalog;
ALTER TABLE local_task_tag_catalog_new RENAME TO local_task_tag_catalog;
