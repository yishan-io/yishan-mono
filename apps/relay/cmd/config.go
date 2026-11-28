package cmd

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/viper"
)

// Config holds all relay server configuration.
type Config struct {
	Host     string
	Port     int
	APIToken string

	JWTSecret   string
	JWTIssuer   string
	JWTAudience string


	LogLevel string
}

func defaultConfig() Config {
	return Config{
		Host:             "0.0.0.0",
		Port:             8788,
		JWTIssuer:        "https://yishan.io",
		JWTAudience:      "api-service",
		LogLevel:         "info",
	}
}

func configFromEnv() (Config, error) {
	cfg := defaultConfig()
	v := viper.New()
	v.SetConfigFile(".env")
	v.SetConfigType("env")
	v.AutomaticEnv()

	v.SetDefault("HOST", cfg.Host)
	v.SetDefault("PORT", cfg.Port)
	v.SetDefault("JWT_ISSUER", cfg.JWTIssuer)
	v.SetDefault("JWT_AUDIENCE", cfg.JWTAudience)
	v.SetDefault("LOG_LEVEL", cfg.LogLevel)

	if err := v.ReadInConfig(); err != nil {
		if !errors.As(err, &viper.ConfigFileNotFoundError{}) && !os.IsNotExist(err) {
			return cfg, fmt.Errorf("read .env: %w", err)
		}
	}

	cfg.Host = v.GetString("HOST")
	cfg.Port = v.GetInt("PORT")
	cfg.JWTSecret = v.GetString("JWT_SECRET")
	cfg.APIToken = v.GetString("RELAY_API_TOKEN")
	cfg.JWTIssuer = v.GetString("JWT_ISSUER")
	cfg.JWTAudience = v.GetString("JWT_AUDIENCE")
	cfg.LogLevel = v.GetString("LOG_LEVEL")

	return cfg, nil
}
