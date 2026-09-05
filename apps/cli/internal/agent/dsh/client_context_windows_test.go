package dsh

import "testing"

func TestProviderCatalogWire_RejectsContextWindowField(t *testing.T) {
	var response providerCatalogWire
	err := decodeStrictJSON([]byte(`{"providers":[{"id":"deepseek-official","authentication":"api-key","setupRequired":true,"models":[{"provider":"deepseek-official","id":"deepseek-v4-flash","name":"DeepSeek","contextWindow":128000}]}]}`), &response)
	if err == nil {
		t.Fatal("accepted contextWindow in the compatible provider catalog response")
	}
}

func TestProviderContextWindowWire_AcceptsRequestedPositiveValue(t *testing.T) {
	request := ProviderContextWindowRequest{Routes: []ProviderContextWindowRoute{{Provider: "deepseek-official", Model: "deepseek-v4-flash"}}}
	var response providerContextWindowWireResult
	if err := decodeStrictJSON([]byte(`{"contextWindows":[{"provider":"deepseek-official","model":"deepseek-v4-flash","contextWindow":128000}]}`), &response); err != nil {
		t.Fatalf("decode context windows: %v", err)
	}
	result, err := response.validate(request)
	if err != nil || len(result.ContextWindows) != 1 || result.ContextWindows[0].ContextWindow != 128000 {
		t.Fatalf("result = %#v, err = %v", result, err)
	}
}

func TestProviderContextWindowWire_RejectsInvalidOrUnrequestedRoutes(t *testing.T) {
	request := ProviderContextWindowRequest{Routes: []ProviderContextWindowRoute{{Provider: "deepseek-official", Model: "deepseek-v4-flash"}}}
	for _, response := range []providerContextWindowWireResult{
		{ContextWindows: []providerContextWindowWire{{Provider: "deepseek-official", Model: "deepseek-v4-flash", ContextWindow: 0}}},
		{ContextWindows: []providerContextWindowWire{{Provider: "other", Model: "deepseek-v4-flash", ContextWindow: 128000}}},
	} {
		if _, err := response.validate(request); err == nil {
			t.Fatalf("accepted invalid context windows response: %#v", response)
		}
	}
}

func TestProviderContextWindowRequest_RejectsInvalidRoutes(t *testing.T) {
	for _, request := range []ProviderContextWindowRequest{
		{Routes: []ProviderContextWindowRoute{{Provider: "", Model: "model"}}},
		{Routes: []ProviderContextWindowRoute{{Provider: "provider", Model: "model"}, {Provider: "provider", Model: "model"}}},
	} {
		if err := validateProviderContextWindowRequest(request); err == nil {
			t.Fatalf("accepted invalid context windows request: %#v", request)
		}
	}
}
