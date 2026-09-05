# @yishan-io/dsh-daemon-bridge

Private daemon-to-DSH bridge contract library for DeepSeek Harness.

This package owns the private daemon↔DSH wire protocol, Cordis bridge service, and base capability client. It does not contain workspace lifecycle, memory, or other domain operation DTOs and clients. Domain packages use the capability transport without access to raw JSON-RPC.
