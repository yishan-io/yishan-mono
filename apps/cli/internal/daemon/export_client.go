package daemon

import daemonclient "yishan/apps/cli/internal/daemon/client"

type Client = daemonclient.Client

func NewDaemonClient(url string, token string) *Client {
	return daemonclient.New(url, token)
}
