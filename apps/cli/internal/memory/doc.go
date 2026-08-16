// Package memory owns the local memory store and its summarization workflows:
// the SQLite-backed file index, session summarization, daily persona batch
// extraction, and index reconciliation. The Service type is the application
// facade; the per-context-root summary queue and the daily persona batch are
// its background owners.
package memory
