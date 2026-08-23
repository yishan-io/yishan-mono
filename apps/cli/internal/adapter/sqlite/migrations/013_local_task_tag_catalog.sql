CREATE TABLE local_task_tag_catalog (
  normalized_tag TEXT PRIMARY KEY,
  tag TEXT NOT NULL,
  color TEXT CHECK (color IS NULL OR color IN ('amber', 'blue', 'green', 'purple', 'red', 'teal')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE local_task_tag_catalog_aliases (
  normalized_tag TEXT NOT NULL REFERENCES local_task_tag_catalog(normalized_tag) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (normalized_tag, tag)
);

WITH ranked_tags AS (
  SELECT normalized_tag, tag,
    ROW_NUMBER() OVER (
      PARTITION BY normalized_tag
      ORDER BY local_task_id, position
    ) AS row_number
  FROM local_task_tags
)
INSERT INTO local_task_tag_catalog (normalized_tag, tag)
SELECT normalized_tag, tag FROM ranked_tags WHERE row_number = 1;

INSERT INTO local_task_tag_catalog_aliases (normalized_tag, tag)
SELECT DISTINCT normalized_tag, tag FROM local_task_tags;
