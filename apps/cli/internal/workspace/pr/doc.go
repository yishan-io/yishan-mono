// Package pr owns continuous pull-request observation for tracked workspaces.
// The Tracker type is the single lifecycle owner of the poll loop and refresh
// coordination; git queries go through the git service and PR persistence goes
// through consumer-owned hooks, so the tracker stays observation-only.
package pr
