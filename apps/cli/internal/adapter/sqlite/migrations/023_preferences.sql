-- Values are copied verbatim, including unknown versions and invalid legacy JSON.
-- Legacy metadata is retained for rollback/older binaries.
CREATE TABLE preferences (
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (scope, key)
);

INSERT INTO preferences (scope, key, value)
SELECT substr(key, length('project_list_preferences:') + 1), 'project.navigator', value
FROM _metadata WHERE substr(key, 1, length('project_list_preferences:')) = 'project_list_preferences:';

INSERT INTO preferences (scope, key, value)
SELECT substr(key, length('project_filter_preferences:') + 1), 'project.filter', value
FROM _metadata WHERE substr(key, 1, length('project_filter_preferences:')) = 'project_filter_preferences:';

INSERT INTO preferences (scope, key, value)
SELECT substr(key, length('task_hub_filter_preferences:') + 1), 'task.filter', value
FROM _metadata WHERE substr(key, 1, length('task_hub_filter_preferences:')) = 'task_hub_filter_preferences:';
