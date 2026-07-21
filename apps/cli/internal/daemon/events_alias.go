package daemon

import internalevents "yishan/apps/cli/internal/events"

type frontendEvent = internalevents.Event

type eventHub = internalevents.Hub

var newEventHub = internalevents.NewHub
