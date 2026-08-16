// Package collection owns the token-usage collection pipeline: it schedules
// agent-transcript scans, synchronizes dirty hourly rows to the cloud API, and
// backfills historical cost estimates. The Collector type is the single
// lifecycle owner of every timer and background loop in this package; nothing
// else starts or stops a collection process.
package collection
