package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/localtask"
)

// ListTags returns globally retained Local Task tag catalog entries by stable ID.
func (store *LocalTaskStore) ListTags(ctx context.Context) ([]localtask.Tag, error) {
	rows, err := store.database.QueryContext(ctx, `SELECT catalog.id,catalog.normalized_tag,catalog.tag,catalog.color,catalog.custom_color,aliases.tag FROM local_task_tag_catalog catalog JOIN local_task_tag_catalog_aliases aliases ON aliases.tag_id=catalog.id ORDER BY catalog.normalized_tag,aliases.tag`)
	if err != nil {
		return nil, fmt.Errorf("list local task tag catalog: %w", err)
	}
	defer rows.Close()
	tags := []localtask.Tag{}
	for rows.Next() {
		var tag localtask.Tag
		var alias string
		if err := rows.Scan(&tag.ID, &tag.Key, &tag.Name, &tag.Color, &tag.CustomColor, &alias); err != nil {
			return nil, fmt.Errorf("scan local task tag catalog: %w", err)
		}
		if len(tags) == 0 || tags[len(tags)-1].ID != tag.ID {
			tag.Aliases = []string{}
			tags = append(tags, tag)
		}
		tags[len(tags)-1].Aliases = append(tags[len(tags)-1].Aliases, alias)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate local task tag catalog: %w", err)
	}
	return tags, nil
}

// CreateTag creates one stable catalog tag.
func (store *LocalTaskStore) CreateTag(ctx context.Context, create localtask.TagCreate) (localtask.Tag, error) {
	return store.createTag(ctx, create.Name)
}
func (store *LocalTaskStore) createTag(ctx context.Context, name string) (localtask.Tag, error) {
	tx, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return localtask.Tag{}, fmt.Errorf("begin create local task tag: %w", err)
	}
	defer tx.Rollback()
	tag, err := ensureTag(ctx, tx, name)
	if err != nil {
		return localtask.Tag{}, err
	}
	if err := tx.Commit(); err != nil {
		return localtask.Tag{}, fmt.Errorf("commit create local task tag: %w", err)
	}
	return store.getTagCatalogEntry(ctx, tag.ID)
}

// RenameTag changes the display spelling and records it as an alias. A matching key merges into its existing target.
func (store *LocalTaskStore) RenameTag(ctx context.Context, id, name string) (localtask.Tag, error) {
	tx, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return localtask.Tag{}, fmt.Errorf("begin rename local task tag: %w", err)
	}
	defer tx.Rollback() // best-effort rollback unless commit succeeds
	targetID, err := store.renameTag(ctx, tx, id, name)
	if err != nil {
		return localtask.Tag{}, err
	}
	if err := tx.Commit(); err != nil {
		return localtask.Tag{}, fmt.Errorf("commit rename local task tag: %w", err)
	}
	return store.getTagCatalogEntry(ctx, targetID)
}

func (store *LocalTaskStore) renameTag(ctx context.Context, tx *sql.Tx, id, name string) (string, error) {
	renamed, err := localtask.NormalizeTag(name)
	if err != nil {
		return "", err
	}
	key, err := localtask.NormalizeTagKey(renamed)
	if err != nil {
		return "", err
	}
	var targetID string
	err = tx.QueryRowContext(ctx, `SELECT id FROM local_task_tag_catalog WHERE normalized_tag=?`, key).Scan(&targetID)
	switch {
	case err == nil && targetID != id:
		if err := addLocalTaskTagAlias(ctx, tx, targetID, renamed); err != nil {
			return "", err
		}
		if err := store.mergeTags(ctx, tx, targetID, id); err != nil {
			return "", err
		}
		return targetID, nil
	case err == nil || errors.Is(err, sql.ErrNoRows):
		if err := renameLocalTaskTag(ctx, tx, id, key, renamed); err != nil {
			return "", err
		}
		return id, nil
	default:
		return "", fmt.Errorf("find rename target: %w", err)
	}
}

func renameLocalTaskTag(ctx context.Context, tx *sql.Tx, id, key, name string) error {
	result, err := tx.ExecContext(ctx, `UPDATE local_task_tag_catalog SET normalized_tag=?,tag=?,updated_at=datetime('now') WHERE id=?`, key, name, id)
	if err != nil {
		return fmt.Errorf("rename local task tag: %w", err)
	}
	if err := requireTagUpdated(result); err != nil {
		return err
	}
	return addLocalTaskTagAlias(ctx, tx, id, name)
}

func addLocalTaskTagAlias(ctx context.Context, q localTaskQueryer, id, name string) error {
	if _, err := q.ExecContext(ctx, `INSERT INTO local_task_tag_catalog_aliases(tag_id,tag) VALUES (?,?) ON CONFLICT(tag_id,tag) DO NOTHING`, id, name); err != nil {
		return fmt.Errorf("add local task tag alias: %w", err)
	}
	return nil
}

// MergeTags moves source references and aliases into target, retaining target color when it is set.
func (store *LocalTaskStore) MergeTags(ctx context.Context, targetID, sourceID string) (localtask.Tag, error) {
	if targetID == sourceID {
		return store.getTagCatalogEntry(ctx, targetID)
	}
	tx, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return localtask.Tag{}, fmt.Errorf("begin merge local task tags: %w", err)
	}
	defer tx.Rollback()
	if err := store.mergeTags(ctx, tx, targetID, sourceID); err != nil {
		return localtask.Tag{}, err
	}
	if err := tx.Commit(); err != nil {
		return localtask.Tag{}, fmt.Errorf("commit merge local task tags: %w", err)
	}
	return store.getTagCatalogEntry(ctx, targetID)
}
func (store *LocalTaskStore) mergeTags(ctx context.Context, tx *sql.Tx, targetID, sourceID string) error {
	if err := preserveMergedTagColor(ctx, tx, targetID, sourceID); err != nil {
		return err
	}
	if err := moveTagAliases(ctx, tx, targetID, sourceID); err != nil {
		return err
	}
	return moveMergedTagReferences(ctx, tx, targetID, sourceID)
}

func preserveMergedTagColor(ctx context.Context, tx *sql.Tx, targetID, sourceID string) error {
	targetColor, targetCustom, err := loadTagColors(ctx, tx, targetID)
	if err != nil {
		return err
	}
	sourceColor, sourceCustom, err := loadTagColors(ctx, tx, sourceID)
	if err != nil {
		return err
	}
	if targetColor != nil || targetCustom != nil || (sourceColor == nil && sourceCustom == nil) {
		return nil
	}
	if _, err := tx.ExecContext(ctx, `UPDATE local_task_tag_catalog SET color=?,custom_color=? WHERE id=?`, sourceColor, sourceCustom, targetID); err != nil {
		return fmt.Errorf("preserve merged tag color: %w", err)
	}
	return nil
}

func loadTagColors(ctx context.Context, tx *sql.Tx, id string) (*string, *string, error) {
	var color, customColor *string
	if err := tx.QueryRowContext(ctx, `SELECT color,custom_color FROM local_task_tag_catalog WHERE id=?`, id).Scan(&color, &customColor); err != nil {
		return nil, nil, tagNotFound(err)
	}
	return color, customColor, nil
}

func moveTagAliases(ctx context.Context, tx *sql.Tx, targetID, sourceID string) error {
	if _, err := tx.ExecContext(ctx, `INSERT INTO local_task_tag_catalog_aliases(tag_id,tag) SELECT ?,tag FROM local_task_tag_catalog_aliases WHERE tag_id=? ON CONFLICT(tag_id,tag) DO NOTHING`, targetID, sourceID); err != nil {
		return fmt.Errorf("move tag aliases: %w", err)
	}
	return nil
}

func moveMergedTagReferences(ctx context.Context, tx *sql.Tx, targetID, sourceID string) error {
	if err := deduplicateMergedTagReferences(ctx, tx, targetID, sourceID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE local_task_tags SET tag_id=? WHERE tag_id=?`, targetID, sourceID); err != nil {
		return fmt.Errorf("move tag references: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM local_task_tag_catalog WHERE id=?`, sourceID); err != nil {
		return fmt.Errorf("delete merged tag: %w", err)
	}
	return reindexMergedTagReferences(ctx, tx)
}

func deduplicateMergedTagReferences(ctx context.Context, tx *sql.Tx, targetID, sourceID string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM local_task_tags AS target WHERE target.tag_id=?
		AND EXISTS (SELECT 1 FROM local_task_tags AS source WHERE source.local_task_id=target.local_task_id
			AND source.tag_id=? AND source.position < target.position)`, targetID, sourceID); err != nil {
		return fmt.Errorf("deduplicate later target tag references: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM local_task_tags AS source WHERE source.tag_id=?
		AND EXISTS (SELECT 1 FROM local_task_tags AS target WHERE target.local_task_id=source.local_task_id
			AND target.tag_id=? AND target.position < source.position)`, sourceID, targetID); err != nil {
		return fmt.Errorf("deduplicate later source tag references: %w", err)
	}
	return nil
}

func reindexMergedTagReferences(ctx context.Context, tx *sql.Tx) error {
	if _, err := tx.ExecContext(ctx, `UPDATE local_task_tags SET position=position+1000000`); err != nil {
		return fmt.Errorf("reserve merged tag positions: %w", err)
	}
	_, err := tx.ExecContext(ctx, `WITH ranked AS (SELECT local_task_id,tag_id,ROW_NUMBER() OVER(PARTITION BY local_task_id ORDER BY position)-1 position FROM local_task_tags) UPDATE local_task_tags SET position=(SELECT position FROM ranked WHERE ranked.local_task_id=local_task_tags.local_task_id AND ranked.tag_id=local_task_tags.tag_id)`)
	if err != nil {
		return fmt.Errorf("reindex merged tag references: %w", err)
	}
	return nil
}

// DeleteTag removes a catalog tag and all its task references.
func (store *LocalTaskStore) DeleteTag(ctx context.Context, id string) error {
	result, err := store.database.ExecContext(ctx, `DELETE FROM local_task_tag_catalog WHERE id=?`, id)
	if err != nil {
		return fmt.Errorf("delete local task tag: %w", err)
	}
	return requireTagUpdated(result)
}

// UpdateTagColor sets or clears a global Local Task tag catalog color by stable ID.
func (store *LocalTaskStore) UpdateTagColor(ctx context.Context, id string, update localtask.TagColorUpdate) (localtask.Tag, error) {
	if err := localtask.ValidateTagColorUpdate(update); err != nil {
		return localtask.Tag{}, err
	}
	if update.DisplayName != nil {
		return store.ensureAndUpdateTagColor(ctx, *update.DisplayName, update)
	}
	if strings.TrimSpace(id) != id {
		return localtask.Tag{}, localtask.ErrInvalidTagKey
	}
	id, err := store.resolveTagID(ctx, id)
	if err != nil {
		return localtask.Tag{}, err
	}
	if err := updateLocalTaskTagColor(ctx, store.database, id, update); err != nil {
		return localtask.Tag{}, err
	}
	return store.getTagCatalogEntry(ctx, id)
}

func (store *LocalTaskStore) ensureAndUpdateTagColor(ctx context.Context, name string, update localtask.TagColorUpdate) (localtask.Tag, error) {
	tx, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return localtask.Tag{}, fmt.Errorf("begin ensure local task tag color: %w", err)
	}
	defer tx.Rollback() // best-effort rollback unless commit succeeds
	tag, err := ensureTag(ctx, tx, name)
	if err != nil {
		return localtask.Tag{}, err
	}
	if err := updateLocalTaskTagColor(ctx, tx, tag.ID, update); err != nil {
		return localtask.Tag{}, err
	}
	if err := tx.Commit(); err != nil {
		return localtask.Tag{}, fmt.Errorf("commit ensure local task tag color: %w", err)
	}
	return store.getTagCatalogEntry(ctx, tag.ID)
}

func (store *LocalTaskStore) resolveTagID(ctx context.Context, id string) (string, error) {
	if _, err := store.getTagCatalogEntry(ctx, id); !errors.Is(err, localtask.ErrTagNotFound) {
		return id, err
	}
	var stableID string
	err := store.database.QueryRowContext(ctx, `SELECT id FROM local_task_tag_catalog WHERE normalized_tag=?`, id).Scan(&stableID)
	if err == nil {
		return stableID, nil
	}
	if errors.Is(err, sql.ErrNoRows) {
		return "", localtask.ErrTagNotFound
	}
	return "", fmt.Errorf("resolve legacy local task tag key: %w", err)
}

func updateLocalTaskTagColor(ctx context.Context, q localTaskQueryer, id string, update localtask.TagColorUpdate) error {
	result, err := q.ExecContext(ctx, `UPDATE local_task_tag_catalog SET color=?,custom_color=?,updated_at=datetime('now') WHERE id=?`, update.Color, update.CustomColor, id)
	if err != nil {
		return fmt.Errorf("update local task tag color: %w", err)
	}
	return requireTagUpdated(result)
}

func (store *LocalTaskStore) getTagCatalogEntry(ctx context.Context, id string) (localtask.Tag, error) {
	tags, err := store.ListTags(ctx)
	if err != nil {
		return localtask.Tag{}, err
	}
	for _, tag := range tags {
		if tag.ID == id {
			return tag, nil
		}
	}
	return localtask.Tag{}, localtask.ErrTagNotFound
}
func requireTagUpdated(result sql.Result) error {
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read affected local task tag rows: %w", err)
	}
	if affected == 0 {
		return localtask.ErrTagNotFound
	}
	return nil
}
func tagNotFound(err error) error {
	if errors.Is(err, sql.ErrNoRows) {
		return localtask.ErrTagNotFound
	}
	return fmt.Errorf("load local task tag: %w", err)
}
