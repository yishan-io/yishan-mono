package main

import (
	"os"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/cmd"
	"yishan/apps/cli/internal/output"
)

func main() {
	if err := cmd.Execute(); err != nil {
		log.Error().Err(err).Msg("command failed")
		output.PrintError(err, cmd.ClassifyError(err))
		os.Exit(1)
	}
}
