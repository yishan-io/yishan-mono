package sqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/localtask"
)

const sqliteBindChunkSize = 900

type localTaskQueryer interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func insertLocalTaskTags(ctx context.Context, queryer localTaskQueryer, taskID string, tags []string) error {
	for position, tag := range tags {
		normalizedTag, err := localtask.NormalizeTagKey(tag)
		if err != nil {
			return err
		}
		if _, err := queryer.ExecContext(ctx, `INSERT INTO local_task_tags
			(local_task_id, tag, normalized_tag, position) VALUES (?, ?, ?, ?)`, taskID, tag, normalizedTag, position); err != nil {
			return fmt.Errorf("insert local task tag: %w", err)
		}
	}
	return nil
}

func replaceLocalTaskTags(ctx context.Context, queryer localTaskQueryer, taskID string, tags []string) error {
	if _, err := queryer.ExecContext(ctx, `DELETE FROM local_task_tags WHERE local_task_id = ?`, taskID); err != nil {
		return fmt.Errorf("delete local task tags: %w", err)
	}
	return insertLocalTaskTags(ctx, queryer, taskID, tags)
}

func hydrateLocalTaskTags(ctx context.Context, queryer localTaskQueryer, tasks []*localtask.Task) error {
	if len(tasks) == 0 {
		return nil
	}
	indexesByID := make(map[string][]int, len(tasks))
	ids := make([]string, 0, len(tasks))
	for index, task := range tasks {
		task.Tags = make([]string, 0)
		if _, exists := indexesByID[task.ID]; !exists {
			ids = append(ids, task.ID)
		}
		indexesByID[task.ID] = append(indexesByID[task.ID], index)
	}
	for start := 0; start < len(ids); start += sqliteBindChunkSize {
		end := min(start+sqliteBindChunkSize, len(ids))
		if err := hydrateLocalTaskTagChunk(ctx, queryer, tasks, indexesByID, ids[start:end]); err != nil {
			return err
		}
	}
	return nil
}

func hydrateLocalTaskTagChunk(ctx context.Context, queryer localTaskQueryer, tasks []*localtask.Task, indexesByID map[string][]int, ids []string) error {
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	arguments := make([]any, len(ids))
	for index, id := range ids {
		arguments[index] = id
	}
	rows, err := queryer.QueryContext(ctx, `SELECT local_task_id, tag FROM local_task_tags
		WHERE local_task_id IN (`+placeholders+`) ORDER BY local_task_id, position`, arguments...)
	if err != nil {
		return fmt.Errorf("load local task tags: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var taskID, tag string
		if err := rows.Scan(&taskID, &tag); err != nil {
			return fmt.Errorf("scan local task tag: %w", err)
		}
		for _, index := range indexesByID[taskID] {
			tasks[index].Tags = append(tasks[index].Tags, tag)
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate local task tags: %w", err)
	}
	return nil
}

func getLocalTask(ctx context.Context, queryer localTaskQueryer, taskID string) (localtask.Task, error) {
	task, err := scanLocalTask(queryer.QueryRowContext(ctx,
		`SELECT `+localTaskColumns+` FROM local_tasks WHERE id = ?`, taskID))
	if err != nil {
		return handleLocalTaskGet(taskID, task, err)
	}
	if err := hydrateLocalTaskTags(ctx, queryer, []*localtask.Task{&task}); err != nil {
		return localtask.Task{}, err
	}
	return task, nil
}
