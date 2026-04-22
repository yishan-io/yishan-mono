package cmd

import (
	"yishan/apps/cli/internal/apiclient"

	"github.com/spf13/viper"
)

func doAPIJSON(method string, path string, body any) error {
	client := apiclient.New(viper.GetString("api_base_url"), viper.GetString("api_token"))
	return client.DoJSON(method, path, body)
}
