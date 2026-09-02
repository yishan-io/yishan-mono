package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"yishan/apps/cli/internal/localtask"
)

const sqliteBindChunkSize = 900

type localTaskQueryer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func insertLocalTaskTags(ctx context.Context, q localTaskQueryer, taskID string, tags []string) error {
	refs := make([]localtask.TagRef, 0, len(tags))
	for _, name := range tags {
		tag, err := ensureTag(ctx, q, name)
		if err != nil {
			return err
		}
		refs = append(refs, localtask.TagRef{ID: tag.ID})
	}
	return insertLocalTaskTagRefs(ctx, q, taskID, refs)
}
func insertLocalTaskTagRefs(ctx context.Context, q localTaskQueryer, taskID string, refs []localtask.TagRef) error {
	if err := requireLocalTaskTagRefs(ctx, q, refs); err != nil {
		return err
	}
	for pos, ref := range refs {
		if _, err := q.ExecContext(ctx, `INSERT INTO local_task_tags (local_task_id,tag_id,position,created_at) VALUES (?,?,?,datetime('now'))`, taskID, ref.ID, pos); err != nil {
			return fmt.Errorf("insert local task tag: %w", err)
		}
	}
	return nil
}

func requireLocalTaskTagRefs(ctx context.Context, q localTaskQueryer, refs []localtask.TagRef) error {
	if len(refs) == 0 {
		return nil
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(refs)), ",")
	arguments := make([]any, len(refs))
	for index, ref := range refs {
		arguments[index] = ref.ID
	}
	rows, err := q.QueryContext(ctx, `SELECT id FROM local_task_tag_catalog WHERE id IN (`+placeholders+`)`, arguments...)
	if err != nil {
		return fmt.Errorf("validate local task tag references: %w", err)
	}
	defer rows.Close()
	found := make(map[string]struct{}, len(refs))
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("scan local task tag reference: %w", err)
		}
		found[id] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate local task tag references: %w", err)
	}
	for _, ref := range refs {
		if _, ok := found[ref.ID]; !ok {
			return localtask.ErrTagNotFound
		}
	}
	return nil
}
func replaceLocalTaskTags(ctx context.Context, q localTaskQueryer, taskID string, tags []string) error {
	if _, err := q.ExecContext(ctx, `DELETE FROM local_task_tags WHERE local_task_id=?`, taskID); err != nil {
		return fmt.Errorf("delete local task tags: %w", err)
	}
	return insertLocalTaskTags(ctx, q, taskID, tags)
}
func replaceLocalTaskTagRefs(ctx context.Context, q localTaskQueryer, taskID string, refs []localtask.TagRef) error {
	if _, err := q.ExecContext(ctx, `DELETE FROM local_task_tags WHERE local_task_id=?`, taskID); err != nil {
		return fmt.Errorf("delete local task tags: %w", err)
	}
	return insertLocalTaskTagRefs(ctx, q, taskID, refs)
}
func hydrateLocalTaskTags(ctx context.Context, q localTaskQueryer, tasks []*localtask.Task) error {
	if len(tasks) == 0 {
		return nil
	}
	ids := make([]string, 0, len(tasks))
	byID := map[string][]*localtask.Task{}
	for _, task := range tasks {
		task.Tags = []string{}
		task.TagRefs = []localtask.TagRef{}
		if len(byID[task.ID]) == 0 {
			ids = append(ids, task.ID)
		}
		byID[task.ID] = append(byID[task.ID], task)
	}
	for start := 0; start < len(ids); start += sqliteBindChunkSize {
		end := min(start+sqliteBindChunkSize, len(ids))
		if err := hydrateLocalTaskTagChunk(ctx, q, byID, ids[start:end]); err != nil {
			return err
		}
	}
	return nil
}
func hydrateLocalTaskTagChunk(ctx context.Context, q localTaskQueryer, byID map[string][]*localtask.Task, ids []string) error {
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	rows, err := q.QueryContext(ctx, `SELECT relations.local_task_id,catalog.id,catalog.tag FROM local_task_tags AS relations JOIN local_task_tag_catalog AS catalog ON catalog.id=relations.tag_id WHERE relations.local_task_id IN (`+placeholders+`) ORDER BY relations.local_task_id,relations.position`, args...)
	if err != nil {
		return fmt.Errorf("load local task tags: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var taskID, id, name string
		if err := rows.Scan(&taskID, &id, &name); err != nil {
			return fmt.Errorf("scan local task tag: %w", err)
		}
		for _, task := range byID[taskID] {
			task.TagRefs = append(task.TagRefs, localtask.TagRef{ID: id, Name: name})
			task.Tags = append(task.Tags, name)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate local task tags: %w", err)
	}
	return nil
}
func getLocalTask(ctx context.Context, q localTaskQueryer, taskID string) (localtask.Task, error) {
	task, err := scanLocalTask(q.QueryRowContext(ctx, `SELECT `+localTaskSelectColumns("local_tasks")+` FROM local_tasks WHERE id=?`, taskID))
	if err != nil {
		return handleLocalTaskGet(taskID, task, err)
	}
	if err := hydrateLocalTaskTags(ctx, q, []*localtask.Task{&task}); err != nil {
		return localtask.Task{}, err
	}
	return task, nil
}
func ensureTag(ctx context.Context, q localTaskQueryer, name string) (localtask.Tag, error) {
	normalized, err := localtask.NormalizeTag(name)
	if err != nil {
		return localtask.Tag{}, err
	}
	key, err := localtask.NormalizeTagKey(normalized)
	if err != nil {
		return localtask.Tag{}, err
	}
	if _, err = q.ExecContext(ctx, `INSERT INTO local_task_tag_catalog (id,normalized_tag,tag,created_at,updated_at) VALUES (?,?,?,datetime('now'),datetime('now')) ON CONFLICT(normalized_tag) DO NOTHING`, uuid.NewString(), key, normalized); err != nil {
		return localtask.Tag{}, fmt.Errorf("upsert local task tag catalog entry: %w", err)
	}
	var tag localtask.Tag
	err = q.QueryRowContext(ctx, `SELECT id,normalized_tag,tag FROM local_task_tag_catalog WHERE normalized_tag=?`, key).Scan(&tag.ID, &tag.Key, &tag.Name)
	if err != nil {
		return localtask.Tag{}, fmt.Errorf("load local task tag catalog entry: %w", err)
	}
	if _, err = q.ExecContext(ctx, `INSERT INTO local_task_tag_catalog_aliases(tag_id,tag) VALUES (?,?) ON CONFLICT(tag_id,tag) DO NOTHING`, tag.ID, normalized); err != nil {
		return localtask.Tag{}, fmt.Errorf("upsert local task tag alias: %w", err)
	}
	return tag, nil
}
