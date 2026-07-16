package main

import (
	"os"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/cmd"
	"yishan/apps/cli/internal/output"
	"yishan/apps/cli/internal/rpcerror"
)

func main() {
	if err := cmd.Execute(); err != nil {
		log.Error().Err(err).Msg("command failed")
		code := cmd.ClassifyError(err)
		output.PrintError(err, code)
		os.Exit(rpcerror.CodeToExitCode(code))
	}
}
