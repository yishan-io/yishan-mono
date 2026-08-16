FROM golang:1.24-alpine AS builder

RUN apk add --no-cache ca-certificates

WORKDIR /build

# Preserve the monorepo layout so the go.mod replace of
# yishan/packages/relay-protocol-go resolves inside the image.
COPY apps/relay/go.mod apps/relay/go.sum ./apps/relay/
COPY packages/relay-protocol-go ./packages/relay-protocol-go/

WORKDIR /build/apps/relay
RUN go mod download

COPY apps/relay/ .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /relay .

FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /relay /usr/local/bin/relay

EXPOSE 8788

ENTRYPOINT ["relay"]
CMD ["serve"]
