package sqlite

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"yishan/apps/cli/internal/localtask"
)

func buildLocalTaskListQuery(filter localtask.TaskFilter) (string, []any) {
	query := `SELECT ` + localTaskSelectColumns("local_tasks") + ` FROM local_tasks`
	where, arguments := buildLocalTaskFilter(filter, "local_tasks")
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	return query + " ORDER BY updated_at DESC, id", arguments
}

func buildLocalTaskSearchQuery(search string, filter localtask.TaskFilter) (string, []any) {
	query := `SELECT ` + localTaskSelectColumns("local_tasks") + `, bm25(local_tasks_fts) FROM local_tasks_fts
		JOIN local_tasks ON local_tasks.id = local_tasks_fts.local_task_id`
	where, arguments := buildLocalTaskFilter(filter, "local_tasks")
	where = append([]string{"local_tasks_fts MATCH ?"}, where...)
	arguments = append([]any{escapeLocalTaskFTS5(search)}, arguments...)
	return query + " WHERE " + strings.Join(where, " AND ") + " ORDER BY bm25(local_tasks_fts), local_tasks.id", arguments
}

func escapeLocalTaskFTS5(query string) string {
	tokens := strings.Fields(query)
	if len(tokens) == 0 {
		return `""`
	}
	terms := make([]string, len(tokens))
	for index, token := range tokens {
		terms[index] = `"` + strings.ReplaceAll(token, `"`, `""`) + `"`
	}
	return strings.Join(terms, " OR ")
}

func buildLocalTaskFilter(filter localtask.TaskFilter, table string) ([]string, []any) {
	where := make([]string, 0, 4)
	arguments := make([]any, 0, 4)
	if filter.ProjectID != nil {
		where, arguments = appendTaskFilter(where, arguments, table+".project_id = ?", *filter.ProjectID)
	}
	if len(filter.Statuses) > 0 {
		placeholders := strings.TrimRight(strings.Repeat("?,", len(filter.Statuses)), ",")
		where = append(where, table+".status IN ("+placeholders+")")
		for _, status := range filter.Statuses {
			arguments = append(arguments, status)
		}
	} else if filter.Status != nil {
		where, arguments = appendTaskFilter(where, arguments, table+".status = ?", *filter.Status)
	}
	if filter.Priority != nil {
		where, arguments = appendTaskFilter(where, arguments, table+".priority = ?", *filter.Priority)
	}
	if filter.WorkspaceID != nil {
		where, arguments = appendTaskWorkspaceFilter(where, arguments, table, *filter.WorkspaceID)
	}
	for _, tagID := range filter.TagIDs {
		where, arguments = appendTaskTagFilter(where, arguments, table, "tag_id", tagID)
	}
	for _, normalizedTag := range normalizedTaskFilterTags(filter.Tags) {
		where, arguments = appendTaskTagFilter(where, arguments, table, "catalog.normalized_tag", normalizedTag)
	}
	return where, arguments
}

func appendTaskFilter(where []string, arguments []any, condition string, value any) ([]string, []any) {
	return append(where, condition), append(arguments, value)
}

func normalizedTaskFilterTags(tags []string) []string {
	normalizedTags, err := localtask.NormalizeTags(tags)
	if err != nil {
		return nil
	}
	keys := make([]string, 0, len(normalizedTags))
	for _, tag := range normalizedTags {
		key, err := localtask.NormalizeTagKey(tag)
		if err != nil {
			return nil
		}
		keys = append(keys, key)
	}
	return keys
}

func appendTaskTagFilter(where []string, arguments []any, table string, column string, value string) ([]string, []any) {
	condition := `EXISTS (SELECT 1 FROM local_task_tags JOIN local_task_tag_catalog AS catalog ON catalog.id = local_task_tags.tag_id WHERE local_task_id = ` + table + `.id AND ` + column + ` = ?)`
	return append(where, condition), append(arguments, value)
}

func appendTaskWorkspaceFilter(where []string, arguments []any, table string, workspaceID string) ([]string, []any) {
	condition := `EXISTS (SELECT 1 FROM local_task_workspace_links WHERE local_task_id = ` + table + `.id
		AND workspace_id = ? AND unlinked_at IS NULL)`
	return append(where, condition), append(arguments, workspaceID)
}

func buildLocalTaskUpdate(update localtask.TaskUpdate) (string, []any) {
	assignments := make([]string, 0, 5)
	arguments := make([]any, 0, 5)
	appendLocalTaskTextUpdate(&assignments, &arguments, "title", update.Title)
	appendLocalTaskTextUpdate(&assignments, &arguments, "description", update.Description)
	appendLocalTaskStatusUpdate(&assignments, &arguments, update.Status)
	appendLocalTaskPriorityUpdate(&assignments, &arguments, update.Priority)
	if len(assignments) == 0 {
		return "", nil
	}
	assignments = append(assignments, "updated_at = datetime('now')")
	return `UPDATE local_tasks SET ` + strings.Join(assignments, ", ") + ` WHERE id = ?`, arguments
}

func appendLocalTaskTextUpdate(assignments *[]string, arguments *[]any, column string, value *string) {
	if value == nil {
		return
	}
	*assignments = append(*assignments, column+" = ?")
	*arguments = append(*arguments, *value)
}

func appendLocalTaskStatusUpdate(assignments *[]string, arguments *[]any, status *localtask.Status) {
	if status == nil {
		return
	}
	*assignments = append(*assignments, "status = ?", `completed_at = CASE
		WHEN ? = 'done' AND status <> 'done' THEN datetime('now')
		WHEN ? = 'done' THEN completed_at ELSE NULL END`)
	*arguments = append(*arguments, *status, *status, *status)
}

func appendLocalTaskPriorityUpdate(assignments *[]string, arguments *[]any, priority *localtask.Priority) {
	if priority == nil {
		return
	}
	*assignments = append(*assignments, "priority = ?")
	*arguments = append(*arguments, *priority)
}

func scanLocalTasks(rows *sql.Rows) ([]localtask.Task, error) {
	tasks := make([]localtask.Task, 0)
	for rows.Next() {
		task, err := scanLocalTask(rows)
		if err != nil {
			return nil, fmt.Errorf("scan local task: %w", err)
		}
		tasks = append(tasks, task)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate local tasks: %w", err)
	}
	return tasks, nil
}

func scanLocalTask(scanner interface{ Scan(...any) error }) (localtask.Task, error) {
	task := localtask.Task{Tags: make([]string, 0)}
	var taskKey, projectID, projectKind, projectName, organizationID, completedAt sql.NullString
	err := scanner.Scan(&task.ID, &taskKey, &projectID, &projectKind, &projectName, &organizationID, &task.Title, &task.Description, &task.Status, &task.Priority,
		&task.CreatedAt, &task.UpdatedAt, &completedAt, &task.HasActiveWorkspace)
	if err != nil {
		return localtask.Task{}, err
	}
	if taskKey.Valid {
		task.TaskKey = stringPointer(taskKey.String)
	}
	if projectID.Valid {
		task.ProjectID = stringPointer(projectID.String)
	}
	if projectKind.Valid {
		kind := localtask.ProjectKind(projectKind.String)
		task.ProjectKind = &kind
	}
	if projectName.Valid {
		task.ProjectName = stringPointer(projectName.String)
	}
	if organizationID.Valid {
		task.OrganizationID = stringPointer(organizationID.String)
	}
	if completedAt.Valid {
		task.CompletedAt = stringPointer(completedAt.String)
	}
	return task, nil
}

func scanLocalTaskSearchResults(rows *sql.Rows) ([]localtask.SearchResult, error) {
	results := make([]localtask.SearchResult, 0)
	for rows.Next() {
		result, err := scanLocalTaskSearchResult(rows)
		if err != nil {
			return nil, fmt.Errorf("scan local task search result: %w", err)
		}
		results = append(results, result)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate local task search results: %w", err)
	}
	return results, nil
}

func scanLocalTaskSearchResult(scanner interface{ Scan(...any) error }) (localtask.SearchResult, error) {
	var result localtask.SearchResult
	var taskKey, projectID, projectKind, projectName, organizationID, completedAt sql.NullString
	err := scanner.Scan(&result.ID, &taskKey, &projectID, &projectKind, &projectName, &organizationID, &result.Title, &result.Description, &result.Status,
		&result.Priority, &result.CreatedAt, &result.UpdatedAt, &completedAt, &result.HasActiveWorkspace, &result.Rank)
	if err != nil {
		return localtask.SearchResult{}, err
	}
	if taskKey.Valid {
		result.TaskKey = stringPointer(taskKey.String)
	}
	if projectID.Valid {
		result.ProjectID = stringPointer(projectID.String)
	}
	if projectKind.Valid {
		kind := localtask.ProjectKind(projectKind.String)
		result.ProjectKind = &kind
	}
	if projectName.Valid {
		result.ProjectName = stringPointer(projectName.String)
	}
	if organizationID.Valid {
		result.OrganizationID = stringPointer(organizationID.String)
	}
	if completedAt.Valid {
		result.CompletedAt = stringPointer(completedAt.String)
	}
	return result, nil
}

func scanWorkspaceLinks(rows *sql.Rows) ([]localtask.WorkspaceLink, error) {
	links := make([]localtask.WorkspaceLink, 0)
	for rows.Next() {
		link, err := scanWorkspaceLink(rows)
		if err != nil {
			return nil, fmt.Errorf("scan local task workspace link: %w", err)
		}
		links = append(links, link)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate local task workspace links: %w", err)
	}
	return links, nil
}

func scanWorkspaceLink(scanner interface{ Scan(...any) error }) (localtask.WorkspaceLink, error) {
	var link localtask.WorkspaceLink
	var unlinkedAt sql.NullString
	err := scanner.Scan(&link.ID, &link.LocalTaskID, &link.WorkspaceID, &link.Status, &link.LinkedAt, &unlinkedAt)
	if err != nil {
		return localtask.WorkspaceLink{}, err
	}
	if unlinkedAt.Valid {
		link.UnlinkedAt = stringPointer(unlinkedAt.String)
	}
	return link, nil
}

func handleLocalTaskGet(taskID string, task localtask.Task, err error) (localtask.Task, error) {
	if errors.Is(err, sql.ErrNoRows) {
		return localtask.Task{}, fmt.Errorf("get local task %q: %w", taskID, localtask.ErrTaskNotFound)
	}
	if err != nil {
		return localtask.Task{}, fmt.Errorf("get local task %q: %w", taskID, err)
	}
	return task, nil
}

func requireLocalTaskUpdated(result sql.Result) error {
	updated, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read affected local task rows: %w", err)
	}
	if updated == 0 {
		return localtask.ErrTaskNotFound
	}
	return nil
}

func requireWorkspaceLinkUpdated(result sql.Result) error {
	updated, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("read affected local task workspace link rows: %w", err)
	}
	if updated == 0 {
		return localtask.ErrLinkNotFound
	}
	return nil
}
