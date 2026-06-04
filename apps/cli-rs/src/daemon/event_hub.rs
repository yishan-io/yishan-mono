use serde::Serialize;
use serde_json::Value;
use tokio::sync::broadcast;

/// An event pushed to frontend subscribers.
#[derive(Debug, Clone, Serialize)]
pub struct FrontendEvent {
    pub topic: String,
    pub payload: Value,
}

impl FrontendEvent {
    pub fn new(topic: impl Into<String>, payload: Value) -> Self {
        Self {
            topic: topic.into(),
            payload,
        }
    }
}

/// Subscriber handle — dropped when the subscriber disconnects.
#[allow(dead_code)]
pub struct Subscription {
    pub id: u64,
    pub receiver: broadcast::Receiver<FrontendEvent>,
}

/// Pub/sub event hub.
/// Fixes C4: uses `tokio::sync::broadcast` with bounded capacity (256).
/// Slow subscribers receive a `RecvError::Lagged` error instead of silently being dropped.
#[derive(Clone)]
pub struct EventHub {
    sender: broadcast::Sender<FrontendEvent>,
}

impl EventHub {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(256);
        Self { sender }
    }

    /// Subscribe to all events. Returns a receiver.
    pub fn subscribe(&self) -> broadcast::Receiver<FrontendEvent> {
        self.sender.subscribe()
    }

    /// Publish an event to all current subscribers.
    /// If there are no subscribers the send is a no-op.
    pub fn publish(&self, event: FrontendEvent) {
        let _ = self.sender.send(event);
    }

    /// Number of active subscribers.
    #[allow(dead_code)]
    pub fn subscriber_count(&self) -> usize {
        self.sender.receiver_count()
    }
}

impl Default for EventHub {
    fn default() -> Self {
        Self::new()
    }
}
