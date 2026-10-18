package system

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"strings"
	"testing"
	relayprotocol "yishan/packages/relay-protocol-go"

	"yishan/apps/cli/internal/adapter/sqlite"
	"yishan/apps/cli/internal/rpc"
)

func preferenceTestHandler(t *testing.T) *rpc.PreferencesHandler {
	t.Helper()
	database, err := sqlite.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := sqlite.Migrate(database); err != nil {
		t.Fatal(err)
	}
	service := NewService(Deps{Preferences: sqlite.NewPreferenceStore(database)})
	return &rpc.PreferencesHandler{Services: service}
}

func TestPreferences_RPCContract(t *testing.T) {
	handler := preferenceTestHandler(t)
	cases := []struct{ method, params, want string }{
		{"preferences.get", `{"scope":"opaque","key":"key"}`, `{"found":false}`},
		{"preferences.set", `{"scope":"opaque","key":"key","value":null}`, `{"found":true,"value":null}`},
		{"preferences.set", `{"scope":"opaque","key":"key","value":{"new":true},"initializeOnly":true}`, `{"found":true,"value":null}`},
		{"preferences.get", `{"scope":"opaque","key":"key"}`, `{"found":true,"value":null}`},
		{"preferences.set", `{"scope":"opaque","key":"key","value":[1,"two"]}`, `{"found":true,"value":[1,"two"]}`},
		{"preferences.get", `{"scope":"opaque ","key":"key"}`, `{"found":false}`},
	}
	for _, test := range cases {
		response, err := handler.Call(context.Background(), nil, test.method, json.RawMessage(test.params))
		if err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(response)
		if err != nil || string(encoded) != test.want {
			t.Fatalf("%s: got %s, %v; want %s", test.params, encoded, err, test.want)
		}
	}
}

func TestPreferences_Validation(t *testing.T) {
	handler := preferenceTestHandler(t)
	for _, payload := range []string{
		`{}`, `{"scope":"s","key":""}`, `{"scope":"","key":"k","value":null}`,
		`{"scope":"s","key":"k"}`, `{"scope":"s","key":"k","value":`,
		`{"scope":"s","key":"k","value":true,"initializeOnly":"yes"}`,
		`{"scope":"` + strings.Repeat("s", maxPreferenceScopeBytes+1) + `","key":"k","value":null}`,
		`{"scope":"s","key":"` + strings.Repeat("k", maxPreferenceKeyBytes+1) + `","value":null}`,
		`{"scope":"s","key":"k","value":"` + strings.Repeat("v", maxPreferenceValueBytes) + `"}`,
	} {
		_, err := handler.Call(context.Background(), nil, "preferences.set", json.RawMessage(payload))
		if err == nil {
			t.Fatalf("accepted invalid params: %.100s", payload)
		}
	}
	for _, payload := range []string{`{}`, `{"scope":"s","key":""}`} {
		if _, err := handler.Call(context.Background(), nil, "preferences.get", json.RawMessage(payload)); err == nil {
			t.Fatalf("accepted %s", payload)
		}
	}
	if _, err := handler.Call(context.Background(), nil, "preferences.unknown", nil); err == nil {
		t.Fatal("accepted unknown method")
	}
}

func TestPreferences_StoredValueResponseSerialization(t *testing.T) {
	for _, raw := range []string{`{malformed}`, ``, `  `, ` null `} {
		t.Run(fmt.Sprintf("value=%q", raw), func(t *testing.T) {
			database, err := sqlite.Open(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = database.Close() })
			if err := sqlite.Migrate(database); err != nil {
				t.Fatal(err)
			}
			// Seed the exact bytes retained by the legacy migration.
			if _, err := database.Exec(`INSERT INTO preferences(scope,key,value) VALUES(?,?,?)`, "scope", "key", raw); err != nil {
				t.Fatal(err)
			}
			handler := &rpc.PreferencesHandler{Services: NewService(Deps{Preferences: sqlite.NewPreferenceStore(database)})}
			for _, method := range []string{rpc.MethodPreferencesGet, rpc.MethodPreferencesSet} {
				result, err := handler.Call(context.Background(), nil, method, json.RawMessage(`{"scope":"scope","key":"key","value":123,"initializeOnly":true}`))
				assertStoredPreferenceResponse(t, raw, result, err)
			}
		})
	}
}

func assertStoredPreferenceResponse(t *testing.T, raw string, result any, err error) {
	t.Helper()
	response := relayprotocol.Response{JSONRPC: "2.0", ID: 1}
	if json.Valid([]byte(raw)) {
		if err != nil {
			t.Fatal(err)
		}
		response.Result = result
	} else {
		if !errors.Is(err, sqlite.ErrInvalidStoredPreference) {
			t.Fatalf("expected corrupt preference error, got %v", err)
		}
		response.Error = rpc.MapRPCError(err)
	}
	encoded, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	if json.Valid([]byte(raw)) {
		if !strings.Contains(string(encoded), `"result":{"found":true,"value":null}`) {
			t.Fatalf("null missing from response: %s", encoded)
		}
	} else if !strings.Contains(string(encoded), `"error":`) || strings.Contains(string(encoded), `"result":`) {
		t.Fatalf("expected error response without result: %s", encoded)
	}
}
