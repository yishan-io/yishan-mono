package sqlite

import (
	"database/sql"
	"testing"
)

func TestMigrate_015RebuildsTagRelationsWithOpaqueIDs(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough010(t, database)
	seedPre011WorkspaceLinks(t, database)
	applyMigrationFixture(t, database, "011_remove_local_task_link_role.sql")
	applyMigrationFixture(t, database, "012_local_task_tags.sql")
	seedPre013Tags(t, database)
	applyMigrationFixture(t, database, "013_local_task_tag_catalog.sql")
	applyMigrationFixture(t, database, "014_local_task_tag_custom_color.sql")
	if _, err := database.Exec(`UPDATE local_task_tag_catalog SET color = 'blue' WHERE normalized_tag = 'alpha'`); err != nil {
		t.Fatal(err)
	}

	if err := Migrate(database); err != nil {
		t.Fatalf("upgrade through 014: %v", err)
	}
	assertMigrationCount(t, database, 15)
	assertColumnExists(t, database, "local_task_tag_catalog", "id")
	assertColumnAbsent(t, database, "local_task_tags", "tag")
	assertColumnAbsent(t, database, "local_task_tags", "normalized_tag")
	assertColumnExists(t, database, "local_task_tags", "tag_id")
	assertColumnExists(t, database, "local_task_tag_catalog_aliases", "tag_id")
	assertForeignKeyCheckEmpty(t, database)

	var tagID, name, color string
	if err := database.QueryRow(`SELECT id, tag, color FROM local_task_tag_catalog WHERE normalized_tag = 'alpha'`).Scan(&tagID, &name, &color); err != nil {
		t.Fatalf("load alpha catalog: %v", err)
	}
	if tagID == "" || name != "First" || color != "blue" {
		t.Fatalf("alpha catalog = %q %q %q", tagID, name, color)
	}
	var relationCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM local_task_tags WHERE tag_id = ?`, tagID).Scan(&relationCount); err != nil || relationCount != 2 {
		t.Fatalf("alpha relations = %d, %v; want 2", relationCount, err)
	}
	if _, err := database.Exec(`DELETE FROM local_task_tag_catalog WHERE id = ?`, tagID); err != nil {
		t.Fatalf("delete catalog: %v", err)
	}
	if err := database.QueryRow(`SELECT COUNT(*) FROM local_task_tags WHERE tag_id = ?`, tagID).Scan(&relationCount); err != nil || relationCount != 0 {
		t.Fatalf("cascaded relations = %d, %v", relationCount, err)
	}

	if err := Migrate(database); err != nil {
		t.Fatalf("rerun migrate: %v", err)
	}
	assertMigrationCount(t, database, 15)
}

func TestMigrate_015RejectsMissingRelationCatalogWithoutChangingPriorSchema(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough010(t, database)
	seedPre011WorkspaceLinks(t, database)
	applyMigrationFixture(t, database, "011_remove_local_task_link_role.sql")
	applyMigrationFixture(t, database, "012_local_task_tags.sql")
	seedPre013Tags(t, database)
	applyMigrationFixture(t, database, "013_local_task_tag_catalog.sql")
	applyMigrationFixture(t, database, "014_local_task_tag_custom_color.sql")
	if _, err := database.Exec(`INSERT INTO local_task_tags (local_task_id,tag,normalized_tag,position,created_at) VALUES ('task-active','Orphan','orphan',0,datetime('now'))`); err != nil {
		t.Fatalf("seed malformed relation: %v", err)
	}

	if err := Migrate(database); err == nil {
		t.Fatal("expected malformed migration to fail")
	}
	assertMigrationCount(t, database, 14)
	assertColumnExists(t, database, "local_task_tags", "normalized_tag")
	assertColumnAbsent(t, database, "local_task_tags", "tag_id")
	var orphanCount int
	if err := database.QueryRow(`SELECT COUNT(*) FROM local_task_tags WHERE normalized_tag='orphan'`).Scan(&orphanCount); err != nil || orphanCount != 1 {
		t.Fatalf("orphan relation after failed migration = %d, %v", orphanCount, err)
	}
	assertTableAbsent(t, database, "local_task_tag_catalog_new")
	assertTableAbsent(t, database, "local_task_tags_new")
}

func TestMigrate_015PreservesCatalogAndAssignmentDataAfterReopen(t *testing.T) {
	profileDir := t.TempDir()
	database, err := Open(profileDir)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	applyMigrationsThrough010(t, database)
	seedPre011WorkspaceLinks(t, database)
	applyMigrationFixture(t, database, "011_remove_local_task_link_role.sql")
	applyMigrationFixture(t, database, "012_local_task_tags.sql")
	seedPre013Tags(t, database)
	applyMigrationFixture(t, database, "013_local_task_tag_catalog.sql")
	applyMigrationFixture(t, database, "014_local_task_tag_custom_color.sql")
	seed015CatalogFixtures(t, database)
	if err := Migrate(database); err != nil {
		t.Fatalf("upgrade through 015: %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close upgraded database: %v", err)
	}

	database, err = Open(profileDir)
	if err != nil {
		t.Fatalf("reopen database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("remigrate reopened database: %v", err)
	}
	assertMigrationCount(t, database, 15)
	assert015CatalogFixtures(t, database)
	assertForeignKeyCheckEmpty(t, database)
}

func seed015CatalogFixtures(t *testing.T, database interface {
	Exec(string, ...any) (sql.Result, error)
}) {
	t.Helper()
	if _, err := database.Exec(`UPDATE local_task_tag_catalog SET custom_color='#123456' WHERE normalized_tag='alpha'`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`INSERT INTO local_task_tag_catalog (normalized_tag,tag,custom_color,created_at,updated_at) VALUES ('unassigned','Unassigned','#abcdef',datetime('now'),datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`INSERT INTO local_task_tag_catalog_aliases (normalized_tag,tag) VALUES ('unassigned','Unassigned'),('unassigned','UNASSIGNED')`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(`INSERT INTO local_task_tags (local_task_id,tag,normalized_tag,position,created_at) VALUES ('task-active','First','alpha',0,datetime('now')),('task-active','Beta','beta',1,datetime('now'))`); err != nil {
		t.Fatal(err)
	}
}

func assert015CatalogFixtures(t *testing.T, database *sql.DB) {
	t.Helper()
	var color, customColor *string
	if err := database.QueryRow(`SELECT color,custom_color FROM local_task_tag_catalog WHERE normalized_tag='alpha'`).Scan(&color, &customColor); err != nil || color != nil || customColor == nil || *customColor != "#123456" {
		t.Fatalf("alpha color = %v, %v, %v", color, customColor, err)
	}
	var unassignedName, unassignedCustom string
	if err := database.QueryRow(`SELECT tag,custom_color FROM local_task_tag_catalog WHERE normalized_tag='unassigned'`).Scan(&unassignedName, &unassignedCustom); err != nil || unassignedName != "Unassigned" || unassignedCustom != "#abcdef" {
		t.Fatalf("unassigned catalog = %q, %q, %v", unassignedName, unassignedCustom, err)
	}
	rows, err := database.Query(`SELECT catalog.tag FROM local_task_tags relations JOIN local_task_tag_catalog catalog ON catalog.id=relations.tag_id WHERE relations.local_task_id='task-active' ORDER BY relations.position`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var tags []string
	for rows.Next() {
		var tag string
		if err := rows.Scan(&tag); err != nil {
			t.Fatal(err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil || len(tags) != 2 || tags[0] != "First" || tags[1] != "Beta" {
		t.Fatalf("assignment order = %#v, %v", tags, err)
	}
	var aliases int
	if err := database.QueryRow(`SELECT COUNT(*) FROM local_task_tag_catalog_aliases aliases JOIN local_task_tag_catalog catalog ON catalog.id=aliases.tag_id WHERE catalog.normalized_tag='unassigned'`).Scan(&aliases); err != nil || aliases != 2 {
		t.Fatalf("unassigned aliases = %d, %v", aliases, err)
	}
}
