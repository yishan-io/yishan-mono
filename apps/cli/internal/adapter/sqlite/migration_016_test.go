package sqlite

import (
	"database/sql"
	"testing"
)

func TestMigrate_016ConvertsPresetNamesToHexAndPromotesCustomColor(t *testing.T) {
	database := openMigrationTestDatabase(t)
	applyMigrationsThrough010(t, database)
	seedPre011WorkspaceLinks(t, database)
	applyMigrationFixture(t, database, "011_remove_local_task_link_role.sql")
	applyMigrationFixture(t, database, "012_local_task_tags.sql")
	seedPre013Tags(t, database)
	applyMigrationFixture(t, database, "013_local_task_tag_catalog.sql")
	applyMigrationFixture(t, database, "014_local_task_tag_custom_color.sql")
	// Seed one tag with each legacy preset color and one with a custom hex color.
	if _, err := database.Exec(`INSERT INTO local_task_tag_catalog (normalized_tag,tag,color,created_at,updated_at) VALUES
		('amber-tag','Amber','amber',datetime('now'),datetime('now')),
		('blue-tag','Blue','blue',datetime('now'),datetime('now')),
		('green-tag','Green','green',datetime('now'),datetime('now')),
		('purple-tag','Purple','purple',datetime('now'),datetime('now')),
		('red-tag','Red','red',datetime('now'),datetime('now')),
		('teal-tag','Teal','teal',datetime('now'),datetime('now'))`); err != nil {
		t.Fatalf("seed preset colors: %v", err)
	}
	// Tag with only custom_color (no preset color) should be promoted to color.
	if _, err := database.Exec(`INSERT INTO local_task_tag_catalog (normalized_tag,tag,custom_color,created_at,updated_at) VALUES
		('custom-tag','Custom','#aAbBcC',datetime('now'),datetime('now'))`); err != nil {
		t.Fatalf("seed custom color: %v", err)
	}
	applyMigrationFixture(t, database, "015_local_task_tag_ids.sql")
	if err := Migrate(database); err != nil {
		t.Fatalf("apply migration 016: %v", err)
	}
	assertMigrationCount(t, database, 17)
	assertColumnAbsent(t, database, "local_task_tag_catalog", "custom_color")
	assertForeignKeyCheckEmpty(t, database)

	// Verify legacy preset names were converted to fixed hex values.
	want := map[string]string{
		"amber-tag":  "#F59E0B",
		"blue-tag":   "#3B82F6",
		"green-tag":  "#22C55E",
		"purple-tag": "#A855F7",
		"red-tag":    "#EF4444",
		"teal-tag":   "#14B8A6",
	}
	for tag, hex := range want {
		var color string
		if err := database.QueryRow(`SELECT color FROM local_task_tag_catalog WHERE normalized_tag=?`, tag).Scan(&color); err != nil || color != hex {
			t.Fatalf("tag %q color = %q, %v; want %q", tag, color, err, hex)
		}
	}
	// custom_color promoted and uppercased.
	var customColor string
	if err := database.QueryRow(`SELECT color FROM local_task_tag_catalog WHERE normalized_tag='custom-tag'`).Scan(&customColor); err != nil || customColor != "#AABBCC" {
		t.Fatalf("custom-tag color = %q, %v; want #AABBCC", customColor, err)
	}
	// Rerun is idempotent.
	if err := Migrate(database); err != nil {
		t.Fatalf("rerun migrate: %v", err)
	}
	assertMigrationCount(t, database, 17)
}

func TestMigrate_016HexConstraintRejectsLowercaseAndNonHex(t *testing.T) {
	database := openMigrationTestDatabase(t)
	if err := Migrate(database); err != nil {
		t.Fatalf("full migrate: %v", err)
	}
	// Valid uppercase hex and null are accepted.
	if _, err := database.Exec(`INSERT INTO local_task_tag_catalog (id,normalized_tag,tag,color,created_at,updated_at) VALUES ('t1','valid-hex','Hex','#3B82F6',datetime('now'),datetime('now'))`); err != nil {
		t.Fatalf("insert valid hex: %v", err)
	}
	if _, err := database.Exec(`INSERT INTO local_task_tag_catalog (id,normalized_tag,tag,color,created_at,updated_at) VALUES ('t2','valid-null','Null',NULL,datetime('now'),datetime('now'))`); err != nil {
		t.Fatalf("insert null color: %v", err)
	}
	// Lowercase hex is rejected.
	if _, err := database.Exec(`INSERT INTO local_task_tag_catalog (id,normalized_tag,tag,color,created_at,updated_at) VALUES ('t3','lowercase','Lower','#3b82f6',datetime('now'),datetime('now'))`); err == nil {
		t.Fatal("expected lowercase hex to fail")
	}
	// Named preset is rejected.
	if _, err := database.Exec(`INSERT INTO local_task_tag_catalog (id,normalized_tag,tag,color,created_at,updated_at) VALUES ('t4','named','Named','blue',datetime('now'),datetime('now'))`); err == nil {
		t.Fatal("expected named color to fail")
	}
	// Short hex is rejected.
	if _, err := database.Exec(`INSERT INTO local_task_tag_catalog (id,normalized_tag,tag,color,created_at,updated_at) VALUES ('t5','short','Short','#3B82F',datetime('now'),datetime('now'))`); err == nil {
		t.Fatal("expected short hex to fail")
	}
}

func TestMigrate_016PreservesExistingTagsAndReferencesAfterReopen(t *testing.T) {
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
		t.Fatalf("migrate through 016: %v", err)
	}
	if err := database.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	database, err = Open(profileDir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("remigrate: %v", err)
	}
	assertMigrationCount(t, database, 17)
	assertColumnAbsent(t, database, "local_task_tag_catalog", "custom_color")
	// custom_color='#123456' should be promoted → color='#123456' (already uppercase).
	assert016AlphaCatalog(t, database)
	assertForeignKeyCheckEmpty(t, database)
}

func assert016AlphaCatalog(t *testing.T, database *sql.DB) {
	t.Helper()
	var color *string
	if err := database.QueryRow(`SELECT color FROM local_task_tag_catalog WHERE normalized_tag='alpha'`).Scan(&color); err != nil || color == nil || *color != "#123456" {
		t.Fatalf("alpha color after 016 = %v, %v; want #123456", color, err)
	}
}
